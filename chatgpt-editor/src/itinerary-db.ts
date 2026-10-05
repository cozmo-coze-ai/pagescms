import { Client, types } from "pg";
import { contentRevision, type ItineraryContent, type ItineraryRecord } from "./itinerary-model.ts";
import { cmsUser, fail, type Env } from "./types.ts";

export interface SqlClient { query(text: string, values?: any[]): Promise<{ rows: any[]; rowCount?: number | null }> }
export interface ItineraryRepository {
  authorize(owner: string, write?: boolean): Promise<string>;
  list(owner: string, search: string, offset: number): Promise<any>;
  read(owner: string, slug: string): Promise<ItineraryRecord>;
  ensureAvailable(owner: string, slug: string): Promise<void>;
  create(owner: string, changeId: string, after: ItineraryContent, rationale: string): Promise<{ publishedAt: string; affectsSite: boolean }>;
  publish(owner: string, changeId: string, before: ItineraryRecord, after: ItineraryContent, rationale: string): Promise<{ publishedAt: string; affectsSite: boolean }>;
  published(owner: string, changeId: string): Promise<{ publishedAt: string; affectsSite: boolean } | null>;
}
function fromRow(row: any): ItineraryContent {
  return { slug: row.slug, title: row.title, category: row.category, tag: row.tag, tagColor: row.tag_color, cover: row.cover_path, published: row.published, body: row.body };
}
export class ItineraryDatabase implements ItineraryRepository {
  private inTransaction = false;
  constructor(private env: Env, private sql: SqlClient) {}
  private async freshQuery(text: string, values?: any[]) {
    if (this.inTransaction) return this.sql.query(text, values);
    await this.sql.query("BEGIN READ ONLY");
    try { const result = await this.sql.query(text, values); await this.sql.query("COMMIT"); return result; }
    catch (error) { await this.sql.query("ROLLBACK").catch(() => {}); throw error; }
  }
  async authorize(owner: string, write = false) {
    const id = cmsUser(this.env, owner);
    if (!id) fail("Your connection has not been enabled for CMS itineraries.", 403);
    const { rows } = await this.freshQuery('SELECT id, role FROM public."user" WHERE id=$1' + (write && this.inTransaction ? ' FOR SHARE' : ''), [id]);
    const roles = write ? ["admin","editor"] : ["admin","editor","viewer"];
    if (!rows[0] || !roles.includes(rows[0].role)) fail("Your CMS access was removed or is read-only.", 403);
    return id;
  }
  async list(owner: string, search: string, offset: number) {
    await this.authorize(owner);
    const { rows } = await this.freshQuery(`SELECT slug,title,category,tag,published,updated_at FROM public.cms_itinerary
      WHERE position(lower($1) in lower(title || ' ' || slug))>0 ORDER BY title,slug LIMIT 51 OFFSET $2`, [search, offset]);
    return { items: rows.slice(0,50), nextOffset: rows.length > 50 ? offset + 50 : null };
  }
  async read(owner: string, slug: string) {
    await this.authorize(owner);
    const { rows } = await this.freshQuery("SELECT * FROM public.cms_itinerary WHERE slug=$1", [slug]);
    if (!rows[0]) fail("Itinerary not found. Use listItineraries to choose an existing itinerary.", 404);
    const content = fromRow(rows[0]);
    return { content, revision: await contentRevision(content), updatedAt: new Date(rows[0].updated_at).toISOString() };
  }
  async ensureAvailable(owner: string, slug: string) {
    await this.authorize(owner);
    const { rows } = await this.freshQuery("SELECT 1 FROM public.cms_itinerary WHERE slug=$1", [slug]);
    if (rows[0]) fail("That itinerary address already exists. Choose another address or edit the existing itinerary.", 409);
  }
  async published(owner: string, changeId: string) {
    const id = await this.authorize(owner);
    const { rows } = await this.freshQuery(`SELECT p.published_at, p.published_by, v.content AS before_content, a.content AS after_content
      FROM public.cms_proposal p JOIN public.cms_proposal_version v ON v.proposal_id=p.id AND v.version=0
      JOIN public.cms_proposal_version a ON a.proposal_id=p.id AND a.version=1
      WHERE p.id=$1 AND p.kind='itinerary' AND p.status='published'`, [changeId]);
    if (!rows[0]) return null;
    if (rows[0].published_by !== id) fail("This change belongs to another editor.", 403);
    return { publishedAt: new Date(rows[0].published_at).toISOString(), affectsSite: rows[0].before_content.published || rows[0].after_content.published };
  }
  async publish(owner: string, changeId: string, before: ItineraryRecord, after: ItineraryContent, rationale: string) {
    await this.sql.query("BEGIN");
    this.inTransaction = true;
    try {
      await this.sql.query("SET LOCAL lock_timeout='5s'");
      await this.sql.query("SET LOCAL statement_timeout='15s'");
      const user = await this.authorize(owner, true);
      const previous = await this.published(owner, changeId);
      if (previous) { await this.sql.query("COMMIT"); return previous; }
      const { rows } = await this.sql.query("SELECT * FROM public.cms_itinerary WHERE slug=$1 FOR UPDATE", [before.content.slug]);
      if (!rows[0] || await contentRevision(fromRow(rows[0])) !== before.revision || new Date(rows[0].updated_at).toISOString() !== before.updatedAt) fail("This itinerary changed in the CMS. Read it again and create a fresh preview.", 409);
      if (after.slug !== before.content.slug) fail("An existing itinerary address cannot be renamed from ChatGPT.");
      // All three effects commit together: content, immutable audit versions,
      // and the durable deployment marker watched by the existing CMS cron.
      await this.sql.query(`UPDATE public.cms_itinerary SET title=$2,category=$3,tag=$4,tag_color=$5,cover_path=$6,published=$7,body=$8,updated_at=clock_timestamp(),updated_by=$9 WHERE slug=$1`,
        [after.slug,after.title,after.category,after.tag,after.tagColor,after.cover,after.published,after.body,user]);
      const inserted = await this.sql.query(`INSERT INTO public.cms_proposal(id,kind,target,base_updated_at,status,published_at,published_by)
        VALUES($1,'itinerary',$2,$3,'published',clock_timestamp(),$4) RETURNING published_at`, [changeId,after.slug,before.updatedAt,user]);
      await this.sql.query(`INSERT INTO public.cms_proposal_version(proposal_id,version,content,rationale,author) VALUES
        ($1,0,$2::jsonb,'Content before this change','COZE CMS'),($1,1,$3::jsonb,$4,$5)`,
        [changeId,JSON.stringify(before.content),JSON.stringify(after),rationale,`ChatGPT:${owner}`]);
      const affectsSite = before.content.published || after.published;
      if (affectsSite) await this.sql.query(`INSERT INTO public.cms_deploy_trigger(id,triggered_at,dirty_at) VALUES(1,to_timestamp(0),clock_timestamp()) ON CONFLICT(id) DO UPDATE SET dirty_at=clock_timestamp()`);
      await this.sql.query("COMMIT");
      return { publishedAt: new Date(inserted.rows[0].published_at).toISOString(), affectsSite };
    } catch (error) { await this.sql.query("ROLLBACK").catch(() => {}); throw error; }
    finally { this.inTransaction = false; }
  }
  async create(owner: string, changeId: string, after: ItineraryContent, rationale: string) {
    await this.sql.query("BEGIN");
    this.inTransaction = true;
    try {
      await this.sql.query("SET LOCAL lock_timeout='5s'");
      await this.sql.query("SET LOCAL statement_timeout='15s'");
      const user = await this.authorize(owner, true);
      const previous = await this.published(owner, changeId);
      if (previous) { await this.sql.query("COMMIT"); return previous; }
      try {
        await this.sql.query(`INSERT INTO public.cms_itinerary(slug,title,category,tag,tag_color,cover_path,published,body,updated_at,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp(),$9)`,
          [after.slug,after.title,after.category,after.tag,after.tagColor,after.cover,after.published,after.body,user]);
      } catch (error: any) {
        if (error?.code === "23505") fail("That itinerary address was created by someone else. Choose another address or edit the existing itinerary.", 409);
        throw error;
      }
      const inserted = await this.sql.query(`INSERT INTO public.cms_proposal(id,kind,target,base_updated_at,status,published_at,published_by)
        VALUES($1,'itinerary',$2,NULL,'published',clock_timestamp(),$3) RETURNING published_at`, [changeId,after.slug,user]);
      await this.sql.query(`INSERT INTO public.cms_proposal_version(proposal_id,version,content,rationale,author) VALUES
        ($1,0,'{}'::jsonb,'No prior itinerary; created by this change','COZE CMS'),($1,1,$2::jsonb,$3,$4)`,
        [changeId,JSON.stringify(after),rationale,`ChatGPT:${owner}`]);
      if (after.published) await this.sql.query(`INSERT INTO public.cms_deploy_trigger(id,triggered_at,dirty_at) VALUES(1,to_timestamp(0),clock_timestamp()) ON CONFLICT(id) DO UPDATE SET dirty_at=clock_timestamp()`);
      await this.sql.query("COMMIT");
      return { publishedAt: new Date(inserted.rows[0].published_at).toISOString(), affectsSite: after.published };
    } catch (error) { await this.sql.query("ROLLBACK").catch(() => {}); throw error; }
    finally { this.inTransaction = false; }
  }
}
export async function withItineraryDatabase<T>(env: Env, work: (db: ItineraryDatabase) => Promise<T>) {
  if (!env.CMS_DATABASE?.connectionString) fail("The itinerary database connection needs setup.", 503);
  // CMS timestamps are UTC timestamp-without-time-zone columns. pg otherwise
  // interprets them in the machine's local zone (e.g. Seoul during local tests).
  const sql = new Client({ connectionString: env.CMS_DATABASE.connectionString, connectionTimeoutMillis: 10_000, query_timeout: 20_000,
    types: { getTypeParser: (oid: number, format: any) => oid === 1114 && format !== "binary" ? (value: string) => new Date(value.replace(" ", "T") + "Z") : types.getTypeParser(oid,format) } });
  try {
    await sql.connect();
    // freshQuery uses explicit transactions to avoid cached authorization reads.
    return await work(new ItineraryDatabase(env, sql));
  } finally { await sql.end().catch(() => {}); }
}
