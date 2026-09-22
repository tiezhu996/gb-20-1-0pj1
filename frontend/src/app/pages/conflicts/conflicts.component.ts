import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { ApiService } from '../../services/api.service';
import type { Conflict } from '../../types';

@Component({
  selector: 'app-conflicts',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule
  ],
  template: `
    <div class="page-container">
      <h1 class="page-title">冲突管理</h1>

      <div class="action-bar">
        <button mat-button (click)="loadData()">
          <mat-icon>refresh</mat-icon>
          刷新
        </button>
      </div>

      <div class="table-container">
        <table mat-table [dataSource]="dataSource" class="mat-elevation-z8">
          <ng-container matColumnDef="conflict_type">
            <th mat-header-cell *matHeaderCellDef>冲突类型</th>
            <td mat-cell *matCellDef="let item">
              <mat-chip
                [color]="item.conflict_type === 'teacher' ? 'primary' : item.conflict_type === 'classroom' ? 'accent' : 'warn'"
                selected
              >
                {{ getConflictTypeLabel(item.conflict_type) }}
              </mat-chip>
            </td>
          </ng-container>

          <ng-container matColumnDef="position">
            <th mat-header-cell *matHeaderCellDef>位置</th>
            <td mat-cell *matCellDef="let item">
              周{{ item.day_of_week }} 第{{ item.period }}节
            </td>
          </ng-container>

          <ng-container matColumnDef="message">
            <th mat-header-cell *matHeaderCellDef>详情</th>
            <td mat-cell *matCellDef="let item">{{ item.message }}</td>
          </ng-container>

          <ng-container matColumnDef="resolved">
            <th mat-header-cell *matHeaderCellDef>状态</th>
            <td mat-cell *matCellDef="let item">
              <span [style.color]="item.resolved ? 'green' : '#f44336'">
                {{ item.resolved ? '已解决' : '未解决' }}
              </span>
            </td>
          </ng-container>

          <ng-container matColumnDef="created_at">
            <th mat-header-cell *matHeaderCellDef>检测时间</th>
            <td mat-cell *matCellDef="let item">{{ item.created_at | date: 'yyyy-MM-dd HH:mm' }}</td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
        </table>

        <div *ngIf="dataSource.length === 0" style="padding: 40px; text-align: center;">
          <p>暂无冲突记录。请先进行自动排课或手动检查。</p>
        </div>
      </div>

      <div style="margin-top: 20px;">
        <h3>冲突类型说明</h3>
        <ul>
          <li><strong>教师冲突</strong>：同一教师在同一时间段被安排多门课程</li>
          <li><strong>教室冲突</strong>：同一教室在同一时间段被安排多门课程</li>
          <li><strong>班级冲突</strong>：同一班级在同一时间段被安排多门课程</li>
        </ul>
        <p>解决方式：手动调整排课位置，锁定正确的课程后重新执行自动排课。</p>
      </div>
    </div>
  `
})
export class ConflictsComponent implements OnInit {
  displayedColumns: string[] = ['conflict_type', 'position', 'message', 'resolved', 'created_at'];
  dataSource: Conflict[] = [];

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadData();
  }

  getConflictTypeLabel(type: string): string {
    const map: Record<string, string> = {
      'teacher': '教师冲突',
      'classroom': '教室冲突',
      'class': '班级冲突'
    };
    return map[type] || type;
  }

  loadData(): void {
    this.api.getConflicts().subscribe(data => {
      this.dataSource = data;
    });
  }
}
