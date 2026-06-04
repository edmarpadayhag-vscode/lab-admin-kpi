export type Employee = {
  id: number;
  name: string;
  email: string;
  role: "lab_admin" | "trainer" | "qa" | "employee" | "manager" | "admin";
  department: string | null;
  expectedTimeIn: string;
  restDay1: number | null;
  restDay2: number | null;
  isActive: boolean;
  createdAt: Date;
};
