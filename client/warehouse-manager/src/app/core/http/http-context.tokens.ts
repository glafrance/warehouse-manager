import { HttpContextToken } from '@angular/common/http';

export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);
export const SKIP_GLOBAL_ERROR = new HttpContextToken<boolean>(() => false);
export const HAS_REFRESH_ATTEMPTED = new HttpContextToken<boolean>(() => false);
