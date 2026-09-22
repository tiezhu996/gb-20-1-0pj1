import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../services/api.service';
import type { Semester } from '../../types';

@Component({
  selector: 'app-semesters',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatInputModule,
    MatCheckboxModule,
    MatIconModule
  ],
  template: `
    <div class="page-container">
      <h1 class="page-title">学期管理</h1>

      <div class="action-bar">
        <button mat-raised-button color="primary" (click)="startCreate()">
          <mat-icon>add</mat-icon>
          新建学期
        </button>
        <button mat-button (click)="loadData()">
          <mat-icon>refresh</mat-icon>
          刷新
        </button>
      </div>

      <div *ngIf="showForm" class="form-container">
        <h3>{{ editingId ? '编辑学期' : '新建学期' }}</h3>
        <form [formGroup]="form" (ngSubmit)="save()">
          <mat-form-field class="full-width-field">
            <mat-label>学期名称</mat-label>
            <input matInput formControlName="name" placeholder="如：2024-2025学年第一学期" required>
          </mat-form-field>

          <mat-form-field class="full-width-field">
            <mat-label>开始日期</mat-label>
            <input matInput type="date" formControlName="start_date" required>
          </mat-form-field>

          <mat-form-field class="full-width-field">
            <mat-label>结束日期</mat-label>
            <input matInput type="date" formControlName="end_date" required>
          </mat-form-field>

          <mat-form-field class="full-width-field">
            <mat-label>每周上课天数</mat-label>
            <input matInput type="number" formControlName="weekly_days" min="1" max="7" required>
          </mat-form-field>

          <mat-checkbox formControlName="is_active">设为当前学期</mat-checkbox>

          <div formArrayName="daily_periods">
            <h4>每日时间段配置（按节次）</h4>
            <div *ngFor="let period of dailyPeriods.controls; let i = index" [formGroupName]="i">
              <div style="display: flex; gap: 10px; margin-bottom: 8px;">
                <mat-form-field style="width: 120px;">
                  <mat-label>节次名称</mat-label>
                  <input matInput formControlName="name" placeholder="第1节">
                </mat-form-field>
                <mat-form-field style="width: 80px;">
                  <mat-label>顺序</mat-label>
                  <input matInput type="number" formControlName="order">
                </mat-form-field>
                <button mat-icon-button color="warn" (click)="removePeriod(i)" *ngIf="dailyPeriods.length > 1">
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            </div>
            <button mat-button type="button" (click)="addPeriod()">
              <mat-icon>add</mat-icon> 添加时间段
            </button>
          </div>

          <div style="margin-top: 20px;">
            <button mat-raised-button color="primary" type="submit">保存</button>
            <button mat-button type="button" (click)="cancel()">取消</button>
          </div>
        </form>
      </div>

      <div class="table-container" *ngIf="!showForm">
        <table mat-table [dataSource]="dataSource" class="mat-elevation-z8">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>学期名称</th>
            <td mat-cell *matCellDef="let item">
              {{ item.name }}
              <span *ngIf="item.is_active" style="color: green; margin-left: 8px;">(当前)</span>
            </td>
          </ng-container>

          <ng-container matColumnDef="date_range">
            <th mat-header-cell *matHeaderCellDef>日期范围</th>
            <td mat-cell *matCellDef="let item">{{ item.start_date }} 至 {{ item.end_date }}</td>
          </ng-container>

          <ng-container matColumnDef="weekly_days">
            <th mat-header-cell *matHeaderCellDef>每周天数</th>
            <td mat-cell *matCellDef="let item">{{ item.weekly_days }}天</td>
          </ng-container>

          <ng-container matColumnDef="periods">
            <th mat-header-cell *matHeaderCellDef>每日节数</th>
            <td mat-cell *matCellDef="let item">{{ item.daily_periods?.length || 0 }}节</td>
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
export class SemestersComponent implements OnInit {
  displayedColumns: string[] = ['name', 'date_range', 'weekly_days', 'periods', 'is_active', 'actions'];
  dataSource: Semester[] = [];
  showForm = false;
  editingId: number | null = null;
  form: FormGroup;

  get dailyPeriods(): FormArray {
    return this.form.get('daily_periods') as FormArray;
  }

  constructor(
    private api: ApiService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      id: [null],
      name: ['', Validators.required],
      start_date: ['', Validators.required],
      end_date: ['', Validators.required],
      weekly_days: [5, [Validators.required, Validators.min(1), Validators.max(7)]],
      is_active: [false],
      holidays: [[]],
      daily_periods: this.fb.array([
        this.createPeriod(1, '第1节'),
        this.createPeriod(2, '第2节'),
        this.createPeriod(3, '第3节'),
        this.createPeriod(4, '第4节'),
        this.createPeriod(5, '第5节'),
        this.createPeriod(6, '第6节'),
        this.createPeriod(7, '第7节'),
      ])
    });
  }

  createPeriod(order: number, name: string): FormGroup {
    return this.fb.group({
      order: [order],
      name: [name]
    });
  }

  addPeriod(): void {
    const nextOrder = this.dailyPeriods.length + 1;
    this.dailyPeriods.push(this.createPeriod(nextOrder, `第${nextOrder}节`));
  }

  removePeriod(index: number): void {
    this.dailyPeriods.removeAt(index);
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.api.getSemesters().subscribe(data => {
      this.dataSource = data;
    });
  }

  startCreate(): void {
    this.editingId = null;
    this.form.reset({
      name: '',
      start_date: '',
      end_date: '',
      weekly_days: 5,
      is_active: false,
      holidays: [],
      daily_periods: this.fb.array([
        this.createPeriod(1, '第1节'),
        this.createPeriod(2, '第2节'),
        this.createPeriod(3, '第3节'),
        this.createPeriod(4, '第4节'),
        this.createPeriod(5, '第5节'),
        this.createPeriod(6, '第6节'),
        this.createPeriod(7, '第7节'),
      ])
    });
    this.showForm = true;
  }

  startEdit(item: Semester): void {
    this.editingId = item.id;
    this.dailyPeriods.clear();
    (item.daily_periods || []).forEach(p => {
      this.dailyPeriods.push(this.createPeriod(p.order, p.name));
    });
    this.form.patchValue({
      id: item.id,
      name: item.name,
      start_date: item.start_date,
      end_date: item.end_date,
      weekly_days: item.weekly_days,
      is_active: item.is_active,
      holidays: item.holidays || []
    });
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
      this.api.updateSemester(this.editingId, data).subscribe(() => {
        this.showForm = false;
        this.loadData();
      });
    } else {
      delete data.id;
      this.api.createSemester(data).subscribe(() => {
        this.showForm = false;
        this.loadData();
      });
    }
  }

  deleteItem(item: Semester): void {
    if (confirm(`确定要删除学期 "${item.name}" 吗？`)) {
      this.api.deleteSemester(item.id).subscribe(() => this.loadData());
    }
  }
}
