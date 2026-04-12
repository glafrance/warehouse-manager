export interface UserSummary {
  id?: number | string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  roles?: string[];
}
