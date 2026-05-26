export type Employee = {
  id: number;
  name: string;
  email: string;
  role: "employee" | "manager" | "admin";
  department: string | null;
  expectedTimeIn: string;
  restDay1: number | null;
  restDay2: number | null;
  isActive: boolean;
  createdAt: Date;
};
