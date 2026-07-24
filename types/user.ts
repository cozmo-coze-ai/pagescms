export interface User {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  emailVerified: boolean;
  isAdmin?: boolean;
  role?: "admin" | "editor" | "viewer";
  accounts?: any[];
}
