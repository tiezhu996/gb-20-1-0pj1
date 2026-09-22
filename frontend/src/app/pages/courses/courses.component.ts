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
import type { Course } from '../../types';

const ROOM_TYPES = [
  { value: 'normal', label: '普通教室' },
  { value: 'lab', label: '实验室' },
  { value: 'multimedia', label: '多媒体教室' }
];

const PRIORITIES = [
  { value: 'high', label: '高优先级（主科）' },
  { value: 'medium', label: '中优先级' },
  { value: 'low', label: '低优先级' }
];

@Component({
  selector: 'app-courses',
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
      <h1 class="page-title">课程管理</h1>

      <div class="action-bar">
        <button mat-raised-button color="primary" (click)="startCreate()">
          <mat-icon>add</mat-icon>
          新建课程
        </button>
        <button mat-button (click)="loadData()">
          <mat-icon>refresh</mat-icon>
          刷新
        </button>
      </div>

      <div *ngIf="showForm" class="form-container">
        <h3>{{ editingId ? '编辑课程' : '新建课程' }}</h3>
        <form [formGroup]="form" (ngSubmit)="save()">
          <mat-form-field class="full-width-field">
            <mat-label>课程名称</mat-label>
            <input matInput formControlName="name" required>
          </mat-form-field>

          <mat-form-field class="full-width-field">
            <mat-label>每周课时</mat-label>
            <input matInput type="number" formControlName="weekly_hours" required>
          </mat-form-field>

          <mat-form-field class="full-width-field">
            <mat-label>适用教室类型</mat-label>
            <mat-select formControlName="preferred_room_type" required>
              <mat-option *ngFor="let t of roomTypes" [value]="t.value">
                {{ t.label }}
              </mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field class="full-width-field">
            <mat-label>排课优先级</mat-label>
            <mat-select formControlName="priority" required>
              <mat-option *ngFor="let p of priorities" [value]="p.value">
                {{ p.label }}
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
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>课程名称</th>
            <td mat-cell *matCellDef="let item">{{ item.name }}</td>
          </ng-container>

          <ng-container matColumnDef="weekly_hours">
            <th mat-header-cell *matHeaderCellDef>每周课时</th>
            <td mat-cell *matCellDef="let item">{{ item.weekly_hours }}</td>
          </ng-container>

          <ng-container matColumnDef="preferred_room_type">
            <th mat-header-cell *matHeaderCellDef>适用教室</th>
            <td mat-cell *matCellDef="let item">{{ getRoomTypeLabel(item.preferred_room_type) }}</td>
          </ng-container>

          <ng-container matColumnDef="priority">
            <th mat-header-cell *matHeaderCellDef>优先级</th>
            <td mat-cell *matCellDef="let item">{{ getPriorityLabel(item.priority) }}</td>
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
export class CoursesComponent implements OnInit {
  displayedColumns: string[] = ['name', 'weekly_hours', 'preferred_room_type', 'priority', 'is_active', 'actions'];
  dataSource: Course[] = [];
  roomTypes = ROOM_TYPES;
  priorities = PRIORITIES;
  showForm = false;
  editingId: number | null = null;
  form: FormGroup;

  constructor(
    private api: ApiService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      id: [null],
      name: ['', Validators.required],
      weekly_hours: [2, [Validators.required, Validators.min(1)]],
      preferred_room_type: ['normal', Validators.required],
      priority: ['medium', Validators.required],
      is_active: [true]
    });
  }

  ngOnInit(): void {
    this.loadData();
  }

  getRoomTypeLabel(type: string): string {
    return this.roomTypes.find(t => t.value === type)?.label || type;
  }

  getPriorityLabel(priority: string): string {
    return this.priorities.find(p => p.value === priority)?.label || priority;
  }

  loadData(): void {
    this.api.getCourses().subscribe(data => {
      this.dataSource = data;
    });
  }

  startCreate(): void {
    this.editingId = null;
    this.form.reset({
      name: '',
      weekly_hours: 2,
      preferred_room_type: 'normal',
      priority: 'medium',
      is_active: true
    });
    this.showForm = true;
  }

  startEdit(item: Course): void {
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
    const data = this.form.value;
    if (this.editingId) {
      this.api.updateCourse(this.editingId, data).subscribe(() => {
        this.showForm = false;
        this.loadData();
      });
    } else {
      delete data.id;
      this.api.createCourse(data).subscribe(() => {
        this.showForm = false;
        this.loadData();
      });
    }
  }

  deleteItem(item: Course): void {
    if (confirm(`确定要删除课程 "${item.name}" 吗？`)) {
      this.api.deleteCourse(item.id).subscribe(() => this.loadData());
    }
  }
}
