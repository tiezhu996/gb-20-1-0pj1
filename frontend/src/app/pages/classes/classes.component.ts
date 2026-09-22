import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../services/api.service';
import type { Class, Teacher } from '../../types';

const GRADES = [
  { value: 1, label: '一年级' },
  { value: 2, label: '二年级' },
  { value: 3, label: '三年级' },
  { value: 4, label: '四年级' },
  { value: 5, label: '五年级' },
  { value: 6, label: '六年级' },
  { value: 7, label: '初一' },
  { value: 8, label: '初二' },
  { value: 9, label: '初三' },
  { value: 10, label: '高一' },
  { value: 11, label: '高二' },
  { value: 12, label: '高三' }
];

@Component({
  selector: 'app-classes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule
  ],
  template: `
    <div class="page-container">
      <h1 class="page-title">班级管理</h1>

      <div class="action-bar">
        <button mat-raised-button color="primary" (click)="startCreate()">
          <mat-icon>add</mat-icon>
          新建班级
        </button>
        <button mat-button (click)="loadData()">
          <mat-icon>refresh</mat-icon>
          刷新
        </button>
      </div>

      <div *ngIf="showForm" class="form-container">
        <h3>{{ editingId ? '编辑班级' : '新建班级' }}</h3>
        <form [formGroup]="form" (ngSubmit)="save()">
          <mat-form-field class="full-width-field">
            <mat-label>年级</mat-label>
            <mat-select formControlName="grade" required>
              <mat-option *ngFor="let g of grades" [value]="g.value">
                {{ g.label }}
              </mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field class="full-width-field">
            <mat-label>班级名称</mat-label>
            <input matInput formControlName="name" placeholder="如：1班、2班" required>
          </mat-form-field>

          <mat-form-field class="full-width-field">
            <mat-label>学生人数</mat-label>
            <input matInput type="number" formControlName="student_count" required>
          </mat-form-field>

          <mat-form-field class="full-width-field">
            <mat-label>班主任</mat-label>
            <mat-select formControlName="class_teacher">
              <mat-option [value]="null">无</mat-option>
              <mat-option *ngFor="let t of teachers" [value]="t.id">
                {{ t.name }} - {{ t.subject }}
              </mat-option>
            </mat-select>
          </mat-form-field>

          <mat-checkbox formControlName="is_active">启用</mat-checkbox>

          <div>
            <button mat-raised-button color="primary" type="submit">保存</button>
            <button mat-button type="button" (click)="cancel()">取消</button>
          </div>
        </form>
      </div>

      <div class="table-container" *ngIf="!showForm">
        <table mat-table [dataSource]="dataSource" class="mat-elevation-z8">
          <ng-container matColumnDef="grade">
            <th mat-header-cell *matHeaderCellDef>年级</th>
            <td mat-cell *matCellDef="let item">{{ getGradeLabel(item.grade) }}</td>
          </ng-container>

          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>班级</th>
            <td mat-cell *matCellDef="let item">{{ item.name }}</td>
          </ng-container>

          <ng-container matColumnDef="student_count">
            <th mat-header-cell *matHeaderCellDef>人数</th>
            <td mat-cell *matCellDef="let item">{{ item.student_count }}</td>
          </ng-container>

          <ng-container matColumnDef="class_teacher">
            <th mat-header-cell *matHeaderCellDef>班主任</th>
            <td mat-cell *matCellDef="let item">{{ item.class_teacher_name || '-' }}</td>
          </ng-container>

          <ng-container matColumnDef="is_active">
            <th mat-header-cell *matHeaderCellDef>状态</th>
            <td mat-cell *matCellDef="let item">{{ item.is_active ? '启用' : '禁用' }}</td>
          </ng-container>

          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef>操作</th>
            <td mat-cell *matCellDef="let item" class="action-cell">
              <button mat-icon-button color="primary" (click)="startEdit(item)">
                <mat-icon>edit</mat-icon>
              </button>
              <button mat-icon-button color="warn" (click)="deleteItem(item)">
                <mat-icon>delete</mat-icon>
              </button>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
        </table>
      </div>
    </div>
  `
})
export class ClassesComponent implements OnInit {
  displayedColumns: string[] = ['grade', 'name', 'student_count', 'class_teacher', 'is_active', 'actions'];
  dataSource: Class[] = [];
  teachers: Teacher[] = [];
  grades = GRADES;
  showForm = false;
  editingId: number | null = null;
  form: FormGroup;

  constructor(
    private api: ApiService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      id: [null],
      grade: [null, Validators.required],
      name: ['', Validators.required],
      student_count: [0, [Validators.required, Validators.min(1)]],
      class_teacher: [null],
      is_active: [true]
    });
  }

  ngOnInit(): void {
    this.loadData();
    this.loadTeachers();
  }

  getGradeLabel(grade: number): string {
    return this.grades.find(g => g.value === grade)?.label || grade.toString();
  }

  loadData(): void {
    this.api.getClasses().subscribe(data => {
      this.dataSource = data;
    });
  }

  loadTeachers(): void {
    this.api.getTeachers().subscribe(data => {
      this.teachers = data;
    });
  }

  startCreate(): void {
    this.editingId = null;
    this.form.reset({
      grade: null,
      name: '',
      student_count: 0,
      class_teacher: null,
      is_active: true
    });
    this.showForm = true;
  }

  startEdit(item: Class): void {
    this.editingId = item.id;
    this.form.patchValue(item);
    this.showForm = true;
  }

  cancel(): void {
    this.showForm = false;
  }

  save(): void {
    if (this.form.invalid) {
      alert('请填写必填字段');
      return;
    }
    const data = { ...this.form.value };
    if (data.class_teacher === null) {
      delete data.class_teacher;
    }
    if (this.editingId) {
      this.api.updateClass(this.editingId, data).subscribe(() => {
        this.showForm = false;
        this.loadData();
      });
    } else {
      delete data.id;
      this.api.createClass(data).subscribe(() => {
        this.showForm = false;
        this.loadData();
      });
    }
  }

  deleteItem(item: Class): void {
    if (confirm(`确定要删除班级 "${this.getGradeLabel(item.grade)}${item.name}" 吗？`)) {
      this.api.deleteClass(item.id).subscribe(() => this.loadData());
    }
  }
}
