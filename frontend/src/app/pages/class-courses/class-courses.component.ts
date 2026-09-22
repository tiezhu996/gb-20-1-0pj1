import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../services/api.service';
import type { ClassCourse, Class, Course, Teacher, Semester } from '../../types';

@Component({
  selector: 'app-class-courses',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule
  ],
  template: `
    <div class="page-container">
      <h1 class="page-title">课程分配</h1>
      <p>为每个班级配置课程和任课教师，这是自动排课的基础。</p>

      <div class="filter-bar">
        <mat-form-field class="filter-select">
          <mat-label>选择学期</mat-label>
          <mat-select [(value)]="selectedSemesterId" (selectionChange)="loadData()">
            <mat-option *ngFor="let s of semesters" [value]="s.id">
              {{ s.name }}
              <span *ngIf="s.is_active" style="color: green;"> (当前)</span>
            </mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <div class="action-bar">
        <button mat-raised-button color="primary" (click)="startCreate()" [disabled]="!selectedSemesterId">
          <mat-icon>add</mat-icon>
          新建分配
        </button>
        <button mat-button (click)="loadData()">
          <mat-icon>refresh</mat-icon>
          刷新
        </button>
      </div>

      <div *ngIf="showForm" class="form-container">
        <h3>新建课程分配</h3>
        <form [formGroup]="form" (ngSubmit)="save()">
          <mat-form-field class="full-width-field">
            <mat-label>班级</mat-label>
            <mat-select formControlName="class_id" required>
              <mat-option *ngFor="let c of classes" [value]="c.id">
                {{ c.grade }}年级 {{ c.name }}
              </mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field class="full-width-field">
            <mat-label>课程</mat-label>
            <mat-select formControlName="course" required>
              <mat-option *ngFor="let c of courses" [value]="c.id">
                {{ c.name }} (每周{{ c.weekly_hours }}课时)
              </mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field class="full-width-field">
            <mat-label>任课教师</mat-label>
            <mat-select formControlName="teacher" required>
              <mat-option *ngFor="let t of teachers" [value]="t.id">
                {{ t.name }} - {{ t.subject }}
              </mat-option>
            </mat-select>
          </mat-form-field>

          <div>
            <button mat-raised-button color="primary" type="submit" [disabled]="!form.valid">保存</button>
            <button mat-button type="button" (click)="cancel()">取消</button>
          </div>
        </form>
      </div>

      <div class="table-container" *ngIf="!showForm && selectedSemesterId">
        <table mat-table [dataSource]="dataSource" class="mat-elevation-z8">
          <ng-container matColumnDef="class_name">
            <th mat-header-cell *matHeaderCellDef>班级</th>
            <td mat-cell *matCellDef="let item">{{ item.class_name }}</td>
          </ng-container>

          <ng-container matColumnDef="course_name">
            <th mat-header-cell *matHeaderCellDef>课程</th>
            <td mat-cell *matCellDef="let item">{{ item.course_name }}</td>
          </ng-container>

          <ng-container matColumnDef="teacher_name">
            <th mat-header-cell *matHeaderCellDef>教师</th>
            <td mat-cell *matCellDef="let item">{{ item.teacher_name }}</td>
          </ng-container>

          <ng-container matColumnDef="weekly_hours">
            <th mat-header-cell *matHeaderCellDef>周课时</th>
            <td mat-cell *matCellDef="let item">{{ item.weekly_hours }}</td>
          </ng-container>

          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef>操作</th>
            <td mat-cell *matCellDef="let item" class="action-cell">
              <button mat-icon-button color="warn" (click)="deleteItem(item)">
                <mat-icon>delete</mat-icon>
              </button>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
        </table>
      </div>

      <div *ngIf="!selectedSemesterId" class="page-container">
        <p>请先选择一个学期来管理课程分配。</p>
      </div>
    </div>
  `
})
export class ClassCoursesComponent implements OnInit {
  displayedColumns: string[] = ['class_name', 'course_name', 'teacher_name', 'weekly_hours', 'actions'];
  dataSource: ClassCourse[] = [];
  semesters: Semester[] = [];
  classes: Class[] = [];
  courses: Course[] = [];
  teachers: Teacher[] = [];
  selectedSemesterId: number | null = null;
  showForm = false;
  form: FormGroup;

  constructor(
    private api: ApiService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      class_id: [null, Validators.required],
      course: [null, Validators.required],
      teacher: [null, Validators.required],
      semester: [null]
    });
  }

  ngOnInit(): void {
    this.loadSemesters();
    this.loadClasses();
    this.loadCourses();
    this.loadTeachers();
  }

  loadSemesters(): void {
    this.api.getSemesters().subscribe(data => {
      this.semesters = data;
      const active = data.find(s => s.is_active);
      if (active) {
        this.selectedSemesterId = active.id;
        this.loadData();
      }
    });
  }

  loadClasses(): void {
    this.api.getClasses().subscribe(data => {
      this.classes = data;
    });
  }

  loadCourses(): void {
    this.api.getCourses().subscribe(data => {
      this.courses = data;
    });
  }

  loadTeachers(): void {
    this.api.getTeachers().subscribe(data => {
      this.teachers = data;
    });
  }

  loadData(): void {
    if (this.selectedSemesterId) {
      this.api.getClassCourses(this.selectedSemesterId).subscribe(data => {
        this.dataSource = data;
      });
    }
  }

  startCreate(): void {
    if (!this.selectedSemesterId) return;
    this.form.reset({
      class_id: null,
      course: null,
      teacher: null,
      semester: this.selectedSemesterId
    });
    this.showForm = true;
  }

  cancel(): void {
    this.showForm = false;
  }

  save(): void {
    if (this.form.invalid || !this.selectedSemesterId) return;
    const data = {
      ...this.form.value,
      semester: this.selectedSemesterId
    };
    this.api.createClassCourse(data).subscribe(() => {
      this.showForm = false;
      this.loadData();
    });
  }

  deleteItem(item: ClassCourse): void {
    if (confirm(`确定要删除这个课程分配吗？`)) {
      this.api.deleteClassCourse(item.id).subscribe(() => this.loadData());
    }
  }
}
