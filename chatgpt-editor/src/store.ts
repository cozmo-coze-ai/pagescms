import { DurableObject } from "cloudflare:workers";
import { Backend } from "./backend.ts";
import { PublicError, member, members, sha256, type Env, type Store } from "./types.ts";
import { cmsUser } from "./types.ts";
import { withItineraryDatabase } from "./itinerary-db.ts";
import { ItineraryBackend } from "./itinerary-backend.ts";

export class EditorStore extends DurableObject<Env> {
  private serial = Promise.resolve();
  fetch(request: Request): Promise<Response> {
    // All publication operations use one object: serialized across actors and
    // requests, with intent persisted before touching the production Git ref.
    const pending = this.serial.then(() => this.run(request));
    this.serial = pending.then(() => {}, () => {});
    return pending;
  }
  private async run(request: Request) {
    try {
      const { actor, method, input } = await request.json() as any;
      const store = this.ctx.storage as unknown as Store;
      if (method === "itinerary:preview") {
        return await withItineraryDatabase(this.env, db => new ItineraryBackend(this.env,store,db).preview(input.changeId,input.token,input.photoId));
      }
      if (method === "login") {
        const key = `login:${await sha256(input.ip || "unknown")}`;
        const record = await store.get<{ count: number; until: number }>(key);
        const current = record && record.until > Date.now() ? record : { count: 0, until: Date.now() + 600_000 };
        if (current.count >= 10) return Response.json({ error: "Too many sign-in attempts. Try again in ten minutes." }, { status: 429 });
        current.count++; await store.put(key, current);
        const hash = await sha256(String(input.key));
        const user = members(this.env).find(m => m.enabled && m.keyHash === hash);
        if (!user) return Response.json({ error: "That connection key was not recognized." }, { status: 401 });
        return Response.json({ id: user.id, name: user.name });
      }
      if (!member(this.env, actor)) return Response.json({ error: "Your team access has been removed." }, { status: 403 });
      if(method === "profile") return Response.json({id:actor,name:member(this.env,actor)!.name,homepage:true,itineraries:Boolean(cmsUser(this.env,actor)),scopesAvailable:["homepage:read","homepage:write",...(cmsUser(this.env,actor)?["itineraries:read","itineraries:write"]:[])]});
      if(method.startsWith("itinerary:")) {
        const value=await withItineraryDatabase(this.env,async db=>{
          const itinerary=new ItineraryBackend(this.env,store,db);
          switch(method) {
            case "itinerary:list":return itinerary.list(actor,input);
            case "itinerary:read":return itinerary.read(actor,input.slug);
            case "itinerary:photo":return itinerary.photo(actor,input);
            case "itinerary:prepare":return itinerary.prepare(actor,input);
            case "itinerary:status":return itinerary.status(actor,input.changeId);
            case "itinerary:show":return itinerary.status(actor,input.changeId,true);
            case "itinerary:viewed":return itinerary.viewed(actor,input.changeId,input.viewToken);
            case "itinerary:publish":return itinerary.publish(actor,input.changeId,input.confirmedByUser);
            default:throw new PublicError("Unknown itinerary operation.",404);
          }
        });
        return Response.json(value);
      }
      const backend = new Backend(this.env, store);
      let value;
      switch (method) {
        case "read": value = await backend.read(); break;
        case "file": value = await backend.file(input.path); break;
        case "prepare": value = await backend.prepare(actor, input); break;
        case "status": value = await backend.status(actor, input.changeId); break;
        case "viewed": value = await backend.viewed(actor, input.changeId, input.viewToken); break;
        case "publish": value = await backend.publish(actor, input.changeId, input.confirmedByUser); break;
        case "list": value = await backend.list(actor); break;
        default: return new Response("Not found", { status: 404 });
      }
      return Response.json(value);
    } catch (error) {
      const diagnostic = !(error instanceof PublicError) && error instanceof Error ? {
        name: error.name,
        message: [this.env.GITHUB_TOKEN, this.env.CF_API_TOKEN, this.env.TEAM_MEMBERS_JSON, this.env.SUPABASE_SERVICE_ROLE_KEY, this.env.CMS_DATABASE?.connectionString].filter((secret): secret is string => Boolean(secret))
          .reduce((message, secret) => message.split(secret!).join("[redacted]"), error.message).slice(0, 300),
        frames: error.stack?.split("\n").slice(1, 5),
      } : undefined;
      if (!(error instanceof PublicError)) console.error("Homepage backend failure", {
        name: error instanceof Error ? error.name : typeof error,
        frames: error instanceof Error ? error.stack?.split("\n").slice(1, 5) : [],
      });
      return Response.json({ error: error instanceof PublicError ? error.message : "The homepage request failed. Try again or ask the owner to check the connection.",
        diagnostic,
      }, { status: error instanceof PublicError ? error.status : 500 });
    }
  }
}

export async function callStore(env: Env, actor: string, method: string, input: unknown = {}) {
  const stub = env.EDITOR.get(env.EDITOR.idFromName("homepage"));
  const r = await stub.fetch(new Request("https://editor.internal/", { method: "POST", body: JSON.stringify({ actor, method, input }) }));
  const value: any = await r.json();
  if (!r.ok) {
    if (value.diagnostic) console.error("Homepage backend failure", value.diagnostic);
    throw new PublicError(value.error, r.status);
  }
  return value;
}
