import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterModule,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule
  ],
  template: `
    <div class="app-container">
      <mat-sidenav-container>
        <mat-sidenav mode="side" opened>
          <mat-toolbar color="primary">
            <span>排课系统</span>
          </mat-toolbar>
          <mat-nav-list>
            <a mat-list-item routerLink="/dashboard" routerLinkActive="active" class="nav-list-item">
              <mat-icon>dashboard</mat-icon>
              <span>Dashboard</span>
            </a>
            <a mat-list-item routerLink="/classrooms" routerLinkActive="active" class="nav-list-item">
              <mat-icon>meeting_room</mat-icon>
              <span>教室管理</span>
            </a>
            <a mat-list-item routerLink="/teachers" routerLinkActive="active" class="nav-list-item">
              <mat-icon>person</mat-icon>
              <span>教师管理</span>
            </a>
            <a mat-list-item routerLink="/classes" routerLinkActive="active" class="nav-list-item">
              <mat-icon>group</mat-icon>
              <span>班级管理</span>
            </a>
            <a mat-list-item routerLink="/courses" routerLinkActive="active" class="nav-list-item">
              <mat-icon>book</mat-icon>
              <span>课程管理</span>
            </a>
            <a mat-list-item routerLink="/semesters" routerLinkActive="active" class="nav-list-item">
              <mat-icon>calendar_today</mat-icon>
              <span>学期管理</span>
            </a>
            <a mat-list-item routerLink="/class-courses" routerLinkActive="active" class="nav-list-item">
              <mat-icon>assignment</mat-icon>
              <span>课程分配</span>
            </a>
            <a mat-list-item routerLink="/timetable" routerLinkActive="active" class="nav-list-item">
              <mat-icon>grid_view</mat-icon>
              <span>课表管理</span>
            </a>
            <a mat-list-item routerLink="/conflicts" routerLinkActive="active" class="nav-list-item">
              <mat-icon>warning</mat-icon>
              <span>冲突管理</span>
            </a>
          </mat-nav-list>
        </mat-sidenav>

        <mat-sidenav-content>
          <mat-toolbar color="primary">
            <span>智能课程表排课系统</span>
          </mat-toolbar>
          <router-outlet></router-outlet>
        </mat-sidenav-content>
      </mat-sidenav-container>
    </div>
  `
})
export class AppComponent {
  title = '智能课程表排课系统';
}
