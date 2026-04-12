import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';

import { getErrorMessage } from '../../../../core/error-handling/error-message.utils';
import { UserSummary } from '../../../../core/models/user.models';
import { UsersService } from '../../../../core/services/users.service';

@Component({
  selector: 'app-admin-users-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-users-page.component.html',
  styleUrl: './admin-users-page.component.scss',
})
export class AdminUsersPageComponent implements OnInit {
  private readonly usersService = inject(UsersService);

  protected users: UserSummary[] = [];
  protected loading = false;
  protected loadError = '';

  ngOnInit(): void {
    this.loadUsers();
  }

  protected loadUsers(): void {
    this.loading = true;
    this.loadError = '';

    this.usersService.getUsers().subscribe({
      next: (users) => {
        this.users = users;
      },
      error: (error) => {
        this.loadError = getErrorMessage(error);
        this.loading = false;
      },
      complete: () => {
        this.loading = false;
      },
    });
  }

  protected addUser(): void {
    alert('Add User is intentionally non-functional for now.');
  }
}
