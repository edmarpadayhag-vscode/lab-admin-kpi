export type Employee = {
  id: number;
  name: string;
  email: string;
  role: "employee" | "manager" | "admin";
  department: string | null;
  expectedTimeIn: string;
  isActive: boolean;
  createdAt: Date;
};
