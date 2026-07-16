"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessionTable } from "@/db/schema";
import { requireAdminSession } from "@/lib/admin";

const logoutUserSessions = async (userId: string) => {
  const { user } = await requireAdminSession();

  await db.delete(sessionTable).where(eq(sessionTable.userId, userId));
  revalidatePath("/cms/settings");

  if (user.id === userId) {
    redirect("/sign-in");
  }

  return { success: true };
};

export { logoutUserSessions };
