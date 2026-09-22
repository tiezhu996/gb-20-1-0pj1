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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { ApiService } from '../../services/api.service';
import type {
  ScheduleEntry, Semester, Class, Teacher, Classroom, SwapResponse
} from '../../types';

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
    MatFormFieldModule,
    MatInputModule,
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
          <mat-select [(value)]="viewMode" (selectionChange)="onViewModeChange()">
            <mat-option value="class">按班级</mat-option>
            <mat-option value="teacher">按教师</mat-option>
            <mat-option value="classroom">按教室</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field class="filter-select" *ngIf="viewMode === 'class'">
          <mat-label>班级</mat-label>
          <mat-select [(value)]="selectedClassId" (selectionChange)="onEntityChange()">
            <mat-option *ngFor="let c of classes" [value]="c.id">
              {{ c.grade }}年级 {{ c.name }}
            </mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field class="filter-select" *ngIf="viewMode === 'teacher'">
          <mat-label>教师</mat-label>
          <mat-select [(value)]="selectedTeacherId" (selectionChange)="onEntityChange()">
            <mat-option *ngFor="let t of teachers" [value]="t.id">
              {{ t.name }}
            </mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field class="filter-select" *ngIf="viewMode === 'classroom'">
          <mat-label>教室</mat-label>
          <mat-select [(value)]="selectedClassroomId" (selectionChange)="onEntityChange()">
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
        <button
          mat-raised-button
          color="accent"
          (click)="startSwapSelection()"
          [disabled]="!selectedSemesterId || swapMode"
        >
          <mat-icon>swap_horiz</mat-icon>
          发起调课
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

      <!-- 调课：选择两条排课 -->
      <mat-card *ngIf="swapMode" class="swap-panel" appearance="outlined">
        <mat-card-content>
          <div class="swap-panel-row">
            <mat-icon color="accent">swap_horiz</mat-icon>
            <span>
              已选择 <strong>{{ selectedEntryIds.length }}</strong>/2 条排课
              （调课模式下展示整学期课表，可跨班级/教室选择；已锁定的排课不能调课）
            </span>
            <button mat-button (click)="cancelSwapSelection()">取消</button>
          </div>

          <ng-container *ngIf="selectedSwapEntries.length > 0">
            <div class="swap-selected-list">
              <mat-chip *ngFor="let e of selectedSwapEntries"
                color="primary" selected
                (removed)="toggleEntrySelection(e)">
                {{ describeEntry(e) }}（{{ slotLabel(e) }}）
                <mat-icon matChipRemove>cancel</mat-icon>
              </mat-chip>
            </div>
          </ng-container>

          <ng-container *ngIf="selectedEntryIds.length === 2">
            <mat-form-field appearance="outline" class="swap-reason-field">
              <mat-label>调课原因（选填）</mat-label>
              <input matInput [(ngModel)]="swapReason" placeholder="例如：教师临时开会">
            </mat-form-field>
            <div class="swap-panel-row">
              <button
                mat-raised-button
                color="primary"
                (click)="submitSwap()"
                [disabled]="swapSubmitting"
              >
                <mat-icon>check</mat-icon>
                {{ swapSubmitting ? '试算中...' : '试算并交换' }}
              </button>
            </div>
          </ng-container>
        </mat-card-content>
      </mat-card>

      <!-- 调课结果：交换成功或拒绝原因（刷新后仍可展示） -->
      <mat-card
        *ngIf="lastSwapResult"
        class="swap-result-panel"
        [class.swap-success]="lastSwapResult.status === 'success'"
        [class.swap-rejected]="lastSwapResult.status === 'rejected'"
        appearance="outlined"
      >
        <mat-card-content>
          <div class="swap-panel-row">
            <mat-icon>{{ lastSwapResult.status === 'success' ? 'check_circle' : 'block' }}</mat-icon>
            <span class="swap-result-message">{{ lastSwapResult.message }}</span>
            <span *ngIf="lastSwapResult.replayed" class="swap-replayed-tag">（历史提交结果）</span>
            <button mat-icon-button (click)="dismissSwapResult()" title="关闭">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <div *ngIf="lastSwapResult.status === 'success' && lastSwapResult.entry1 && lastSwapResult.entry2"
               class="swap-detail-text">
            {{ describeEntry(lastSwapResult.entry1) }} ⇄ {{ describeEntry(lastSwapResult.entry2) }}
            已交换时段
            <span *ngIf="lastSwapResult.conflicts?.length" class="swap-warn-text">
              ；重算后课表仍有 {{ lastSwapResult.conflicts.length }} 条冲突记录
            </span>
          </div>

          <div *ngIf="lastSwapResult.status === 'rejected'" class="swap-conflict-list">
            <p class="swap-warn-text">原课表未做任何修改，冲突明细如下：</p>
            <ul>
              <li *ngFor="let c of lastSwapResult.conflicts">
                <strong>{{ c.conflict_type_label }}</strong> · {{ c.slot_label }} · {{ c.resource_name }}
                <ul>
                  <li *ngFor="let d of c.involved_courses">
                    {{ d.course_name }}（{{ d.class_name }}，{{ d.teacher_name }}，{{ d.classroom_name }}）
                  </li>
                </ul>
              </li>
            </ul>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card *ngIf="swapError" class="swap-rejected-panel" appearance="outlined">
        <mat-card-content class="swap-panel-row">
          <mat-icon>error_outline</mat-icon>
          <span>{{ swapError }}</span>
          <button mat-icon-button (click)="swapError = ''" title="关闭">
            <mat-icon>close</mat-icon>
          </button>
        </mat-card-content>
      </mat-card>

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
                        [class.selected-entry]="isSelected(entry)"
                        [class.selectable-entry]="swapMode && !entry.is_locked && !isSelected(entry) && selectedEntryIds.length < 2"
                        style="margin-bottom: 4px;"
                        (click)="onCardClick(entry)"
                      >
                        <div class="schedule-course">
                          <mat-icon *ngIf="isSelected(entry)" class="swap-selected-icon">check_circle</mat-icon>
                          {{ entry.course_name }}
                        </div>
                        <div class="schedule-detail">{{ entry.teacher_name }}</div>
                        <div class="schedule-detail">{{ entry.classroom_name }}</div>
                        <div class="schedule-detail">{{ entry.class_name }}</div>
                        <div style="margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap;">
                          <mat-chip *ngIf="entry.is_locked" color="accent" selected>锁定</mat-chip>
                          <mat-chip *ngIf="entry.is_conflict" color="warn" selected>冲突</mat-chip>
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

  // 调课状态
  swapMode = false;
  selectedEntryIds: number[] = [];
  swapReason = '';
  swapSubmitting = false;
  swapError = '';
  lastSwapResult: SwapResponse | null = null;
  private readonly swapStorageKey = 'timetable:last-swap-token';

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
    this.restoreLastSwapResult();
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
    this.clearSelection();
    if (this.selectedSemesterId) {
      this.currentSemester = this.semesters.find(s => s.id === this.selectedSemesterId) || null;
      this.updatePeriodsFromSemester();
      this.loadSchedules();
    }
  }

  onViewModeChange(): void {
    this.clearSelection();
    this.loadSchedules();
  }

  onEntityChange(): void {
    this.clearSelection();
    this.loadSchedules();
  }

  loadSchedules(): void {
    if (!this.selectedSemesterId) return;

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
    });
  }

  getEntryAt(day: number, period: number): ScheduleEntry[] {
    return this.schedules.filter(e => e.day_of_week === day && e.period === period);
  }

  get selectedSwapEntries(): ScheduleEntry[] {
    return this.selectedEntryIds
      .map(id => this.schedules.find(e => e.id === id))
      .filter((e): e is ScheduleEntry => !!e);
  }

  describeEntry(entry: ScheduleEntry): string {
    return `${entry.course_name}（${entry.class_name} · ${entry.teacher_name} · ${entry.classroom_name}）`;
  }

  slotLabel(entry: ScheduleEntry): string {
    return `周${['一', '二', '三', '四', '五', '六', '日'][entry.day_of_week - 1]}第${entry.period}节`;
  }

  isSelected(entry: ScheduleEntry): boolean {
    return this.selectedEntryIds.includes(entry.id);
  }

  startSwapSelection(): void {
    this.swapMode = true;
    this.swapError = '';
    this.lastSwapResult = null;
    this.selectedEntryIds = [];
    this.swapReason = '';
    // 调课需要跨班级/教师/教室选择两条排课，加载整学期完整课表
    if (this.selectedSemesterId) {
      this.api.getSchedulesBySemester(this.selectedSemesterId).subscribe(data => {
        this.schedules = data;
      });
    }
  }

  cancelSwapSelection(): void {
    this.swapMode = false;
    this.selectedEntryIds = [];
    this.swapReason = '';
    this.loadSchedules();
  }

  clearSelection(): void {
    this.swapMode = false;
    this.selectedEntryIds = [];
    this.swapReason = '';
  }

  onCardClick(entry: ScheduleEntry): void {
    if (!this.swapMode) return;
    if (entry.is_locked) {
      this.swapError = '该排课已锁定，不能参与调课';
      return;
    }
    this.swapError = '';
    this.toggleEntrySelection(entry);
  }

  toggleEntrySelection(entry: ScheduleEntry): void {
    const idx = this.selectedEntryIds.indexOf(entry.id);
    if (idx >= 0) {
      this.selectedEntryIds.splice(idx, 1);
      return;
    }
    if (this.selectedEntryIds.length >= 2) return;
    this.selectedEntryIds.push(entry.id);
  }

  submitSwap(): void {
    const [e1, e2] = this.selectedSwapEntries;
    if (!e1 || !e2 || this.swapSubmitting) return;

    // 客户端生成幂等令牌：重复点击 / 并发重试只会让同一笔调课生效一次
    const token = this.generateSwapToken();
    localStorage.setItem(this.swapStorageKey, token);

    this.swapSubmitting = true;
    this.swapError = '';
    this.api.swapEntries(e1.id, e2.id, this.swapReason || undefined, token).subscribe({
      next: result => {
        this.swapSubmitting = false;
        this.lastSwapResult = result;
        // cancelSwapSelection 会恢复当前视角并重新加载课表
        this.cancelSwapSelection();
      },
      error: err => {
        this.swapSubmitting = false;
        if (err.status === 409 && err.error) {
          // 试算拒绝：后端返回冲突时段与涉及课程
          this.lastSwapResult = err.error as SwapResponse;
          this.cancelSwapSelection();
        } else {
          this.swapError = err.error?.error || '调课失败，请稍后重试';
        }
      }
    });
  }

  dismissSwapResult(): void {
    this.lastSwapResult = null;
    localStorage.removeItem(this.swapStorageKey);
  }

  private restoreLastSwapResult(): void {
    const token = localStorage.getItem(this.swapStorageKey);
    if (!token) return;
    this.api.getSwapResult(token).subscribe({
      next: result => this.lastSwapResult = result,
      error: () => localStorage.removeItem(this.swapStorageKey)
    });
  }

  private generateSwapToken(): string {
    // 带时间戳的随机令牌，浏览器环境下足够保证单笔调课唯一
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 18)}`;
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
}
