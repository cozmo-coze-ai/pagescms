"use client";

import { createContext, useContext } from "react";
import { User } from "@/types/user";

interface UserContextType {
  user: User | null;
  // Read-only "viewer" accounts can't mutate content; everyone else can.
  // Server routes enforce this too (requireApiWriteAccess) — this just lets
  // the UI hide/disable write controls so viewers get a clean read-only view.
  canWrite: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};

export const UserProvider = ({
  user,
  children
}: {
  user: User | null;
  children: React.ReactNode;
}) => {
  const canWrite = user?.role !== "viewer";
  return (
    <UserContext.Provider value={{ user, canWrite }}>
      {children}
    </UserContext.Provider>
  );
};