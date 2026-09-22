import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ComponentPortal, PortalModule } from '@angular/cdk/portal';
import { ApiService } from '../../services/api.service';
import type { Classroom } from '../../types';

@Component({
  selector: 'app-classrooms',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatInputModule,
    MatSelectModule,
    MatDialogModule,
    MatIconModule,
    PortalModule
  ],
  template: `
    <div class="page-container">
      <h1 class="page-title">教室管理</h1>

      <div class="action-bar">
        <button mat-raised-button color="primary" (click)="openDialog()">
          <mat-icon>add</mat-icon>
          新建教室
        </button>
        <button mat-button (click)="loadData()">
          <mat-icon>refresh</mat-icon>
          刷新
        </button>
      </div>

      <div class="table-container">
        <table mat-table [dataSource]="dataSource" class="mat-elevation-z8">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>教室名称</th>
            <td mat-cell *matCellDef="let item">{{ item.name }}</td>
          </ng-container>

          <ng-container matColumnDef="capacity">
            <th mat-header-cell *matHeaderCellDef>容量</th>
            <td mat-cell *matCellDef="let item">{{ item.capacity }}</td>
          </ng-container>

          <ng-container matColumnDef="room_type">
            <th mat-header-cell *matHeaderCellDef>类型</th>
            <td mat-cell *matCellDef="let item">{{ getRoomTypeLabel(item.room_type) }}</td>
          </ng-container>

          <ng-container matColumnDef="is_active">
            <th mat-header-cell *matHeaderCellDef>状态</th>
            <td mat-cell *matCellDef="let item">
              {{ item.is_active ? '启用' : '禁用' }}
            </td>
          </ng-container>

          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef>操作</th>
            <td mat-cell *matCellDef="let item" class="action-cell">
              <button mat-icon-button color="primary" (click)="openDialog(item)" title="编辑">
                <mat-icon>edit</mat-icon>
              </button>
              <button mat-icon-button color="warn" (click)="deleteItem(item)" title="删除">
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
export class ClassroomsComponent implements OnInit {
  displayedColumns: string[] = ['name', 'capacity', 'room_type', 'is_active', 'actions'];
  dataSource: Classroom[] = [];
  form: FormGroup;

  roomTypes = [
    { value: 'normal', label: '普通教室' },
    { value: 'lab', label: '实验室' },
    { value: 'multimedia', label: '多媒体教室' }
  ];

  constructor(
    private api: ApiService,
    private fb: FormBuilder,
    private dialog: MatDialog
  ) {
    this.form = this.fb.group({
      id: [null],
      name: ['', Validators.required],
      capacity: [0, [Validators.required, Validators.min(1)]],
      room_type: ['normal', Validators.required],
      equipment: [[]],
      is_active: [true]
    });
  }

  ngOnInit(): void {
    this.loadData();
  }

  getRoomTypeLabel(type: string): string {
    return this.roomTypes.find(t => t.value === type)?.label || type;
  }

  loadData(): void {
    this.api.getClassrooms().subscribe(data => {
      this.dataSource = data;
    });
  }

  openDialog(item?: Classroom): void {
    if (item) {
      this.form.patchValue(item);
    } else {
      this.form.reset({
        name: '',
        capacity: 0,
        room_type: 'normal',
        equipment: [],
        is_active: true
      });
    }
    this.save();
  }

  save(): void {
    if (this.form.invalid) {
      alert('请填写必填字段');
      return;
    }
    const data = this.form.value;
    if (data.id) {
      this.api.updateClassroom(data.id, data).subscribe(() => this.loadData());
    } else {
      delete data.id;
      this.api.createClassroom(data).subscribe(() => this.loadData());
    }
  }

  deleteItem(item: Classroom): void {
    if (confirm(`确定要删除教室 "${item.name}" 吗？`)) {
      this.api.deleteClassroom(item.id).subscribe(() => this.loadData());
    }
  }
}
