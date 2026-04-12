import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { RegisterPageComponent } from './features/auth/pages/register-page/register-page.component';
import { LoginPageComponent } from './features/auth/pages/login-page/login-page.component';
import { DashboardPageComponent } from './features/dashboard/pages/dashboard-page/dashboard-page.component';
import { InventoryPageComponent } from './features/inventory/pages/inventory-page/inventory-page.component';
import { AdminUsersPageComponent } from './features/admin/pages/admin-users-page/admin-users-page.component';

export const appRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'register',
    component: RegisterPageComponent,
  },
  {
    path: 'login',
    component: LoginPageComponent,
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    component: DashboardPageComponent,
  },
  {
    path: 'inventory',
    canActivate: [authGuard],
    component: InventoryPageComponent,
  },
  {
    path: 'admin/users',
    canActivate: [authGuard, roleGuard(['ADMIN'])],
    component: AdminUsersPageComponent,
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
