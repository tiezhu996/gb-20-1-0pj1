import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { ApiService } from '../../services/api.service';
import type {
  ScheduleEntry, Semester, Class, Teacher, Classroom,
  SwapResponse, SwapConflictDetail
} from '../../types';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

interface PendingSwapKey {
  semesterId: number;
  requestId: string;
}

@Component({
  selector: 'app-timetable',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatSelectModule,
    MatButtonModule,
    MatCheckboxModule,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatChipsModule,
    MatInputModule,
    MatProgressBarModule,
    FullCalendarModule
  ],
  template: `
    <div class="page-container">
      <h1 class="page-title">课表管理</h1>

      <div class="filter-bar">
        <mat-form-field class="filter-select">
          <mat-label>学期</mat-label>
          <mat-select [(value)]="selectedSemesterId" (selectionChange)="onSemesterChange()">
            <mat-option *ngFor="let s of semesters" [value]="s.id">
              {{ s.name }}
              <span *ngIf="s.is_active" style="color: green;"> (当前)</span>
            </mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field class="filter-select">
          <mat-label>查看方式</mat-label>
          <mat-select [(value)]="viewMode" (selectionChange)="loadSchedules()">
            <mat-option value="class">按班级</mat-option>
            <mat-option value="teacher">按教师</mat-option>
            <mat-option value="classroom">按教室</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field class="filter-select" *ngIf="viewMode === 'class'">
          <mat-label>班级</mat-label>
          <mat-select [(value)]="selectedClassId" (selectionChange)="loadSchedules()">
            <mat-option *ngFor="let c of classes" [value]="c.id">
              {{ c.grade }}年级 {{ c.name }}
            </mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field class="filter-select" *ngIf="viewMode === 'teacher'">
          <mat-label>教师</mat-label>
          <mat-select [(value)]="selectedTeacherId" (selectionChange)="loadSchedules()">
            <mat-option *ngFor="let t of teachers" [value]="t.id">
              {{ t.name }}
            </mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field class="filter-select" *ngIf="viewMode === 'classroom'">
          <mat-label>教室</mat-label>
          <mat-select [(value)]="selectedClassroomId" (selectionChange)="loadSchedules()">
            <mat-option *ngFor="let c of classrooms" [value]="c.id">
              {{ c.name }}
            </mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <div class="action-bar">
        <button mat-raised-button color="primary" (click)="runAutoSchedule()" [disabled]="!selectedSemesterId">
          <mat-icon>auto_awesome</mat-icon>
          自动排课
        </button>
        <button mat-raised-button (click)="runAutoSchedule(false)" [disabled]="!selectedSemesterId">
          <mat-icon>refresh</mat-icon>
          重新排课（忽略锁定）
        </button>
        <button mat-button (click)="loadSchedules()">
          <mat-icon>refresh</mat-icon>
          刷新
        </button>
        <button mat-raised-button color="accent" (click)="exportPdf()" [disabled]="!canExport">
          <mat-icon>picture_as_pdf</mat-icon>
          导出 PDF
        </button>
        <button mat-raised-button (click)="exportImage()" [disabled]="!canExport">
          <mat-icon>image</mat-icon>
          导出图片
        </button>
      </div>

      <mat-card class="swap-bar">
        <mat-card-content>
          <div class="swap-bar-row">
            <mat-icon>swap_horiz</mat-icon>
            <span class="swap-hint">{{ swapHint }}</span>
            <span class="swap-selection">
              <ng-container *ngIf="selectedSwapEntries.length > 0">
                <mat-chip-set>
                  <mat-chip
                    *ngFor="let e of selectedSwapEntries"
                    highlighted
                    (removed)="toggleSwapSelection(e)"
                  >
                    {{ e.course_name }} · {{ slotText(e) }}
                    <button matChipRemove>
                      <mat-icon>cancel</mat-icon>
                    </button>
                  </mat-chip>
                </mat-chip-set>
              </ng-container>
            </span>
            <span class="swap-actions">
              <button
                mat-raised-button
                color="primary"
                (click)="confirmSwap()"
                [disabled]="selectedSwapEntries.length !== 2 || swapping"
              >
                <mat-icon>swap_horiz</mat-icon>
                发起调课
              </button>
              <button
                mat-button
                (click)="clearSwapSelection()"
                [disabled]="selectedSwapEntries.length === 0 || swapping"
              >
                清空选择
              </button>
            </span>
          </div>
          <mat-progress-bar
            *ngIf="swapping"
            mode="indeterminate"
            style="margin-top: 8px;"
          ></mat-progress-bar>
          <div class="swap-reason" *ngIf="showReasonInput">
            <mat-form-field appearance="outline" style="width: 360px;">
              <mat-label>调课原因（可选）</mat-label>
              <input matInput [(ngModel)]="swapReason" maxlength="200" />
            </mat-form-field>
            <button mat-raised-button color="primary" (click)="submitSwap()" [disabled]="swapping">
              确认试算并交换
            </button>
            <button mat-button (click)="cancelReason()" [disabled]="swapping">取消</button>
          </div>
        </mat-card-content>
      </mat-card>

      <div *ngIf="swapResult" class="swap-result" [class.swap-success]="swapResult.status === 'success'" [class.swap-rejected]="swapResult.status !== 'success'">
        <div class="swap-result-header">
          <mat-icon>{{ swapResult.status === 'success' ? 'check_circle' : 'error' }}</mat-icon>
          <strong>{{ swapResult.message }}</strong>
          <button mat-icon-button size="small" (click)="swapResult = null" title="关闭">
            <mat-icon>close</mat-icon>
          </button>
        </div>
        <ul *ngIf="swapConflicts.length > 0" class="swap-conflict-list">
          <li *ngFor="let c of swapConflicts">
            <strong>{{ conflictTypeText(c.conflict_type) }}</strong>
            <span *ngIf="c.slot">：{{ c.slot }}</span>
            <span *ngIf="c.entity"> · {{ c.entity }}</span>
            <div class="swap-conflict-courses">涉及课程：{{ c.courses.join('、') }}</div>
            <div class="swap-conflict-msg">{{ c.message }}</div>
          </li>
        </ul>
      </div>

      <div class="timetable-container" #timetableContainer>
        <div *ngIf="schedules.length > 0">
          <h3 style="padding: 16px 16px 0; margin: 0;">{{ currentViewTitle }}</h3>

          <div style="padding: 16px; overflow-x: auto;">
            <table class="mat-elevation-z2" style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #1976d2; color: white;">
                  <th style="padding: 12px; text-align: center; min-width: 100px;">节次</th>
                  <th *ngFor="let day of weekDays" style="padding: 12px; text-align: center; min-width: 150px;">
                    {{ day }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let period of periods; let i = index" [style.background]="i % 2 === 0 ? '#f9f9f9' : 'white'">
                  <td style="padding: 12px; text-align: center; font-weight: bold; border: 1px solid #ddd;">
                    {{ period.name }}
                  </td>
                  <td
                    *ngFor="let day of [1,2,3,4,5]; let di = index"
                    style="padding: 8px; border: 1px solid #ddd; vertical-align: top; min-height: 80px;"
                  >
                    <ng-container *ngFor="let entry of getEntryAt(day, i + 1)">
                      <mat-card
                        class="schedule-card"
                        [class.conflict-entry]="entry.is_conflict"
                        [class.locked-entry]="entry.is_locked"
                        [class.swap-selected]="isSwapSelected(entry)"
                        [class.swap-disabled]="entry.is_locked"
                        style="margin-bottom: 4px;"
                        (click)="onCardClick(entry)"
                      >
                        <div class="schedule-course">{{ entry.course_name }}</div>
                        <div class="schedule-detail">{{ entry.teacher_name }}</div>
                        <div class="schedule-detail">{{ entry.classroom_name }}</div>
                        <div class="schedule-detail">{{ entry.class_name }}</div>
                        <div style="margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap;">
                          <mat-chip *ngIf="entry.is_locked" color="accent" selected>锁定</mat-chip>
                          <mat-chip *ngIf="entry.is_conflict" color="warn" selected>冲突</mat-chip>
                          <mat-chip *ngIf="isSwapSelected(entry)" color="primary" selected>调课</mat-chip>
                          <button
                            mat-icon-button
                            size="small"
                            (click)="toggleLock(entry); $event.stopPropagation()"
                            [title]="entry.is_locked ? '解锁' : '锁定'"
                          >
                            <mat-icon>{{ entry.is_locked ? 'lock' : 'lock_open' }}</mat-icon>
                          </button>
                        </div>
                      </mat-card>
                    </ng-container>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div *ngIf="schedules.length === 0 && selectedSemesterId" style="padding: 40px; text-align: center;">
          <p>当前没有排课数据。点击"自动排课"按钮开始。</p>
        </div>

        <div *ngIf="!selectedSemesterId" style="padding: 40px; text-align: center;">
          <p>请先选择一个学期。</p>
        </div>
      </div>

      <div *ngIf="schedulingMessage" style="margin-top: 16px;">
        <mat-card>
          <mat-card-content>
            <p>{{ schedulingMessage }}</p>
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `
})
export class TimetableComponent implements OnInit {
  @ViewChild('timetableContainer') timetableContainer!: ElementRef;

  semesters: Semester[] = [];
  classes: Class[] = [];
  teachers: Teacher[] = [];
  classrooms: Classroom[] = [];
  schedules: ScheduleEntry[] = [];
  selectedSemesterId: number | null = null;
  selectedClassId: number | null = null;
  selectedTeacherId: number | null = null;
  selectedClassroomId: number | null = null;
  viewMode: 'class' | 'teacher' | 'classroom' = 'class';
  schedulingMessage: string = '';
  currentSemester: Semester | null = null;

  selectedSwapEntries: ScheduleEntry[] = [];
  showReasonInput = false;
  swapReason = '';
  swapping = false;
  swapResult: SwapResponse | null = null;

  private static readonly PENDING_SWAP_KEY = 'timetable.pendingSwap';

  get swapConflicts(): SwapConflictDetail[] {
    if (!this.swapResult) return [];
    return this.swapResult.status === 'success'
      ? (this.swapResult.remaining_conflicts || [])
      : (this.swapResult.conflicts || []);
  }

  get swapHint(): string {
    if (this.swapping) return '正在试算调课，请稍候…';
    if (this.selectedSwapEntries.length === 0) {
      return '点击两张未锁定的课程卡片选择调课（锁定课程不参与调课）';
    }
    if (this.selectedSwapEntries.length === 1) {
      return '已选择第 1 门课，请再点击第 2 门课';
    }
    return '已选两门课，点击"发起调课"进行试算';
  }

  weekDays = ['星期一', '星期二', '星期三', '星期四', '星期五'];
  periods = [
    { name: '第1节', order: 1 },
    { name: '第2节', order: 2 },
    { name: '第3节', order: 3 },
    { name: '第4节', order: 4 },
    { name: '第5节', order: 5 },
    { name: '第6节', order: 6 },
    { name: '第7节', order: 7 },
  ];

  get canExport(): boolean {
    if (!this.selectedSemesterId) return false;
    if (this.viewMode === 'class') return !!this.selectedClassId;
    if (this.viewMode === 'teacher') return !!this.selectedTeacherId;
    if (this.viewMode === 'classroom') return !!this.selectedClassroomId;
    return false;
  }

  get currentViewTitle(): string {
    if (this.viewMode === 'class') {
      const cls = this.classes.find(c => c.id === this.selectedClassId);
      return cls ? `${cls.grade}年级 ${cls.name} 课表` : '';
    }
    if (this.viewMode === 'teacher') {
      const t = this.teachers.find(t => t.id === this.selectedTeacherId);
      return t ? `${t.name} 教师课表` : '';
    }
    if (this.viewMode === 'classroom') {
      const c = this.classrooms.find(c => c.id === this.selectedClassroomId);
      return c ? `${c.name} 教室课表` : '';
    }
    return '';
  }

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadSemesters();
    this.loadClasses();
    this.loadTeachers();
    this.loadClassrooms();
  }

  loadSemesters(): void {
    this.api.getSemesters().subscribe(data => {
      this.semesters = data;
      const active = data.find(s => s.is_active);
      if (active) {
        this.selectedSemesterId = active.id;
        this.currentSemester = active;
        this.updatePeriodsFromSemester();
        this.loadSchedules();
      }
    });
  }

  loadClasses(): void {
    this.api.getClasses().subscribe(data => {
      this.classes = data;
      if (data.length > 0 && !this.selectedClassId) {
        this.selectedClassId = data[0].id;
        if (this.selectedSemesterId) this.loadSchedules();
      }
    });
  }

  loadTeachers(): void {
    this.api.getTeachers().subscribe(data => {
      this.teachers = data;
      if (data.length > 0 && !this.selectedTeacherId) {
        this.selectedTeacherId = data[0].id;
      }
    });
  }

  loadClassrooms(): void {
    this.api.getClassrooms().subscribe(data => {
      this.classrooms = data;
      if (data.length > 0 && !this.selectedClassroomId) {
        this.selectedClassroomId = data[0].id;
      }
    });
  }

  updatePeriodsFromSemester(): void {
    if (this.currentSemester?.daily_periods?.length) {
      this.periods = this.currentSemester.daily_periods
        .slice()
        .sort((a, b) => a.order - b.order);
    }
  }

  onSemesterChange(): void {
    if (this.selectedSemesterId) {
      this.currentSemester = this.semesters.find(s => s.id === this.selectedSemesterId) || null;
      this.updatePeriodsFromSemester();
      this.clearSwapSelection();
      this.loadSchedules();
    }
  }

  loadSchedules(): void {
    if (!this.selectedSemesterId) return;

    this.selectedSwapEntries = [];
    this.showReasonInput = false;

    let obs;
    if (this.viewMode === 'class' && this.selectedClassId) {
      obs = this.api.getSchedulesByClass(this.selectedSemesterId, this.selectedClassId);
    } else if (this.viewMode === 'teacher' && this.selectedTeacherId) {
      obs = this.api.getSchedulesByTeacher(this.selectedSemesterId, this.selectedTeacherId);
    } else if (this.viewMode === 'classroom' && this.selectedClassroomId) {
      obs = this.api.getSchedulesByClassroom(this.selectedSemesterId, this.selectedClassroomId);
    } else {
      obs = this.api.getSchedulesBySemester(this.selectedSemesterId);
    }

    obs.subscribe(data => {
      this.schedules = data;
      this.restorePendingSwapResult();
    });
  }

  getEntryAt(day: number, period: number): ScheduleEntry[] {
    return this.schedules.filter(e => e.day_of_week === day && e.period === period);
  }

  runAutoSchedule(respectLocked = true): void {
    if (!this.selectedSemesterId) return;
    this.schedulingMessage = '正在自动排课，请稍候...';

    this.api.autoSchedule(this.selectedSemesterId, respectLocked).subscribe(result => {
      const total = result.total_entries || 0;
      const conflicts = (result.conflicts || []).length;
      const messages = result.scheduling_messages || [];

      let msg = `排课完成！共安排 ${total} 节课`;
      if (conflicts > 0) {
        msg += `，发现 ${conflicts} 个冲突`;
      }
      if (messages.length > 0) {
        msg += `。提示: ${messages.map((m: any) => m.message).join('; ')}`;
      }
      this.schedulingMessage = msg;
      this.loadSchedules();
    });
  }

  toggleLock(entry: ScheduleEntry): void {
    this.api.updateScheduleEntry(entry.id, { is_locked: !entry.is_locked }).subscribe(() => {
      entry.is_locked = !entry.is_locked;
    });
  }

  exportPdf(): void {
    if (!this.selectedSemesterId) return;
    let type: 'class' | 'teacher' | 'classroom' = 'class';
    let id = 0;

    if (this.viewMode === 'class' && this.selectedClassId) {
      type = 'class';
      id = this.selectedClassId;
    } else if (this.viewMode === 'teacher' && this.selectedTeacherId) {
      type = 'teacher';
      id = this.selectedTeacherId;
    } else if (this.viewMode === 'classroom' && this.selectedClassroomId) {
      type = 'classroom';
      id = this.selectedClassroomId;
    } else {
      return;
    }

    this.api.exportPdf(this.selectedSemesterId, type, id).subscribe(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'timetable.pdf';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  async exportImage(): Promise<void> {
    try {
      const html2canvas = (await import('html2canvas')).default;
      const element = this.timetableContainer.nativeElement;
      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2
      });
      const link = document.createElement('a');
      link.download = 'timetable.png';
      link.href = canvas.toDataURL();
      link.click();
    } catch (e) {
      alert('图片导出功能需要 html2canvas 库');
      console.error(e);
    }
  }

  // ==================== 调课（交换时段） ====================

  onCardClick(entry: ScheduleEntry): void {
    if (entry.is_locked || this.swapping) return;
    this.toggleSwapSelection(entry);
  }

  isSwapSelected(entry: ScheduleEntry): boolean {
    return this.selectedSwapEntries.some(e => e.id === entry.id);
  }

  toggleSwapSelection(entry: ScheduleEntry): void {
    if (entry.is_locked || this.swapping) return;
    const idx = this.selectedSwapEntries.findIndex(e => e.id === entry.id);
    if (idx >= 0) {
      this.selectedSwapEntries.splice(idx, 1);
    } else {
      if (this.selectedSwapEntries.length >= 2) {
        // 已选两门时改选：移除最早的一条
        this.selectedSwapEntries.shift();
      }
      this.selectedSwapEntries.push(entry);
    }
  }

  clearSwapSelection(): void {
    this.selectedSwapEntries = [];
    this.showReasonInput = false;
    this.swapReason = '';
  }

  slotText(entry: ScheduleEntry): string {
    const day = ['一', '二', '三', '四', '五', '六', '日'][entry.day_of_week - 1] || entry.day_of_week;
    return `周${day}第${entry.period}节`;
  }

  conflictTypeText(t: string): string {
    return ({
      teacher: '教师冲突',
      classroom: '教室冲突',
      class: '班级冲突',
      locked: '锁定课程',
      same_slot: '同一时段'
    } as Record<string, string>)[t] || t;
  }

  confirmSwap(): void {
    if (this.selectedSwapEntries.length !== 2) return;
    this.swapResult = null;
    this.showReasonInput = true;
  }

  cancelReason(): void {
    this.showReasonInput = false;
    this.swapReason = '';
  }

  submitSwap(): void {
    if (this.selectedSwapEntries.length !== 2 || this.swapping) return;

    const [entry1, entry2] = this.selectedSwapEntries;
    const requestId = uuid();
    this.swapping = true;
    this.showReasonInput = false;

    // 先记下请求，请求成功返回前刷新页面也能恢复交换结果或拒绝原因
    this.savePendingSwap(requestId);

    this.api.swapEntries(
      entry1.id, entry2.id,
      this.swapReason || undefined,
      requestId
    ).subscribe({
      next: result => this.handleSwapResult(result),
      error: err => {
        // 冲突拒绝（409/423/400）时后端返回结构化响应体
        const body = err?.error;
        if (body && (body.status === 'rejected' || body.conflicts)) {
          this.handleSwapResult(body as SwapResponse);
        } else {
          this.swapping = false;
          this.swapResult = {
            status: 'error',
            message: body?.error || body?.message || '调课请求失败，请稍后重试',
            conflicts: []
          };
        }
      }
    });
  }

  private handleSwapResult(result: SwapResponse): void {
    this.swapping = false;
    this.swapResult = result;
    this.clearPendingSwap();

    if (result.status === 'success') {
      // 交换生效，清空选择并重载课表显示交换结果
      this.selectedSwapEntries = [];
      this.swapReason = '';
      this.loadSchedules();
    }
    // 失败（试算拒绝）保留原课表与当前选择，便于教务员改选后重试
  }

  private savePendingSwap(requestId: string): void {
    if (!this.selectedSemesterId) return;
    const payload: PendingSwapKey = {
      semesterId: this.selectedSemesterId,
      requestId: requestId
    };
    try {
      localStorage.setItem(
        TimetableComponent.PENDING_SWAP_KEY,
        JSON.stringify(payload)
      );
    } catch {
      // 本地存储不可用时不影响调课本身
    }
  }

  private clearPendingSwap(): void {
    try {
      localStorage.removeItem(TimetableComponent.PENDING_SWAP_KEY);
    } catch {
      // ignore
    }
  }

  private restorePendingSwapResult(): void {
    if (this.swapping || !this.selectedSemesterId) return;
    let payload: PendingSwapKey | null = null;
    try {
      const raw = localStorage.getItem(TimetableComponent.PENDING_SWAP_KEY);
      if (raw) payload = JSON.parse(raw) as PendingSwapKey;
    } catch {
      payload = null;
    }
    if (!payload || payload.semesterId !== this.selectedSemesterId) return;

    this.api.getSwapStatus(payload.requestId).subscribe({
      next: result => {
        this.swapResult = result;
        this.clearPendingSwap();
        if (result.status === 'success') {
          this.selectedSwapEntries = [];
          this.loadSchedules();
        }
      },
      error: () => {
        // 记录尚不存在（请求未达后端）时清除无效标记
        this.clearPendingSwap();
      }
    });
  }
}
