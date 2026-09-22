import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../services/api.service';
import type { Teacher } from '../../types';

@Component({
  selector: 'app-teachers',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatInputModule,
    MatIconModule
  ],
  template: `
    <div class="page-container">
      <h1 class="page-title">教师管理</h1>

      <div class="action-bar">
        <button mat-raised-button color="primary" (click)="startCreate()">
          <mat-icon>add</mat-icon>
          新建教师
        </button>
        <button mat-button (click)="loadData()">
          <mat-icon>refresh</mat-icon>
          刷新
        </button>
      </div>

      <div *ngIf="showForm" class="form-container">
        <h3>{{ editingId ? '编辑教师' : '新建教师' }}</h3>
        <form [formGroup]="form" (ngSubmit)="save()">
          <mat-form-field class="full-width-field">
            <mat-label>姓名</mat-label>
            <input matInput formControlName="name" required>
          </mat-form-field>

          <mat-form-field class="full-width-field">
            <mat-label>学科</mat-label>
            <input matInput formControlName="subject" required>
          </mat-form-field>

          <mat-form-field class="full-width-field">
            <mat-label>电话</mat-label>
            <input matInput formControlName="phone">
          </mat-form-field>

          <mat-form-field class="full-width-field">
            <mat-label>邮箱</mat-label>
            <input matInput formControlName="email">
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
            <th mat-header-cell *matHeaderCellDef>姓名</th>
            <td mat-cell *matCellDef="let item">{{ item.name }}</td>
          </ng-container>

          <ng-container matColumnDef="subject">
            <th mat-header-cell *matHeaderCellDef>学科</th>
            <td mat-cell *matCellDef="let item">{{ item.subject }}</td>
          </ng-container>

          <ng-container matColumnDef="phone">
            <th mat-header-cell *matHeaderCellDef>电话</th>
            <td mat-cell *matCellDef="let item">{{ item.phone || '-' }}</td>
          </ng-container>

          <ng-container matColumnDef="email">
            <th mat-header-cell *matHeaderCellDef>邮箱</th>
            <td mat-cell *matCellDef="let item">{{ item.email || '-' }}</td>
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
export class TeachersComponent implements OnInit {
  displayedColumns: string[] = ['name', 'subject', 'phone', 'email', 'is_active', 'actions'];
  dataSource: Teacher[] = [];
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
      subject: ['', Validators.required],
      phone: [''],
      email: [''],
      available_time_slots: [[]],
      is_active: [true]
    });
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.api.getTeachers().subscribe(data => {
      this.dataSource = data;
    });
  }

  startCreate(): void {
    this.editingId = null;
    this.form.reset({
      name: '',
      subject: '',
      phone: '',
      email: '',
      available_time_slots: [],
      is_active: true
    });
    this.showForm = true;
  }

  startEdit(item: Teacher): void {
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
      this.api.updateTeacher(this.editingId, data).subscribe(() => {
        this.showForm = false;
        this.loadData();
      });
    } else {
      delete data.id;
      this.api.createTeacher(data).subscribe(() => {
        this.showForm = false;
        this.loadData();
      });
    }
  }

  deleteItem(item: Teacher): void {
    if (confirm(`确定要删除教师 "${item.name}" 吗？`)) {
      this.api.deleteTeacher(item.id).subscribe(() => this.loadData());
    }
  }
}
