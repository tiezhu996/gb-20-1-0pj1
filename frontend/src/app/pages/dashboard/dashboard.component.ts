import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatCardModule],
  template: `
    <div class="page-container">
      <h1 class="page-title">Dashboard</h1>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
        <mat-card class="stat-card">
          <div class="stat-value">{{ stats.classrooms }}</div>
          <div class="stat-label">教室数量</div>
        </mat-card>

        <mat-card class="stat-card">
          <div class="stat-value">{{ stats.teachers }}</div>
          <div class="stat-label">教师数量</div>
        </mat-card>

        <mat-card class="stat-card">
          <div class="stat-value">{{ stats.classes }}</div>
          <div class="stat-label">班级数量</div>
        </mat-card>

        <mat-card class="stat-card">
          <div class="stat-value">{{ stats.courses }}</div>
          <div class="stat-label">课程数量</div>
        </mat-card>

        <mat-card class="stat-card">
          <div class="stat-value">{{ stats.semesters }}</div>
          <div class="stat-label">学期数量</div>
        </mat-card>

        <mat-card class="stat-card">
          <div class="stat-value" [style.color]="stats.conflicts > 0 ? '#f44336' : '#4caf50'">
            {{ stats.conflicts }}
          </div>
          <div class="stat-label">冲突数量</div>
        </mat-card>
      </div>
    </div>
  `
})
export class DashboardComponent implements OnInit {
  stats = {
    classrooms: 0,
    teachers: 0,
    classes: 0,
    courses: 0,
    semesters: 0,
    conflicts: 0
  };

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadStats();
  }

  loadStats(): void {
    this.api.getClassrooms().subscribe(data => this.stats.classrooms = data.length);
    this.api.getTeachers().subscribe(data => this.stats.teachers = data.length);
    this.api.getClasses().subscribe(data => this.stats.classes = data.length);
    this.api.getCourses().subscribe(data => this.stats.courses = data.length);
    this.api.getSemesters().subscribe(data => this.stats.semesters = data.length);
    this.api.getConflicts().subscribe(data => {
      this.stats.conflicts = data.filter(c => !c.resolved).length;
    });
  }
}
