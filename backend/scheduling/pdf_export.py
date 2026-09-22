from io import BytesIO
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from .models import ScheduleEntry


def generate_class_timetable_pdf(class_obj, semester):
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        rightMargin=1 * cm,
        leftMargin=1 * cm,
        topMargin=1 * cm,
        bottomMargin=1 * cm
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Title'],
        fontSize=18,
        spaceAfter=20,
        alignment=TA_CENTER
    )
    header_style = ParagraphStyle(
        'CustomHeader',
        parent=styles['Normal'],
        fontSize=12,
        alignment=TA_CENTER
    )

    story = []
    title = Paragraph(f"班级课表 - {class_obj.name} ({semester.name})", title_style)
    story.append(title)
    story.append(Spacer(1, 0.5 * cm))

    days = ['星期一', '星期二', '星期三', '星期四', '星期五']
    if semester.weekly_days >= 6:
        days.append('星期六')
    if semester.weekly_days >= 7:
        days.append('星期日')

    periods = []
    for p in semester.daily_periods:
        default_name = f"第{p.get('order', len(periods) + 1)}节"
        periods.append(p.get('name', default_name))
    if not periods:
        periods = [f'第{i+1}节' for i in range(7)]

    schedule_grid = [[''] + days]
    for period_name in periods:
        row = [period_name]
        for _ in days:
            row.append('')
        schedule_grid.append(row)

    entries = ScheduleEntry.objects.filter(
        class_id=class_obj,
        semester=semester
    ).select_related('course', 'teacher', 'classroom')

    for entry in entries:
        try:
            row_idx = entry.period
            col_idx = entry.day_of_week
            if 1 <= row_idx <= len(periods) and 1 <= col_idx <= len(days):
                content = (
                    f"{entry.course.name}\n"
                    f"{entry.teacher.name}\n"
                    f"{entry.classroom.name}"
                )
                schedule_grid[row_idx][col_idx] = content
        except IndexError:
            continue

    col_widths = [2 * cm] + [(doc.width / len(days))] * len(days)
    row_heights = [1 * cm] + [1.8 * cm] * len(periods)

    table = Table(schedule_grid, colWidths=col_widths, rowHeights=row_heights)
    table_style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1976D2')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('BACKGROUND', (0, 1), (0, -1), colors.HexColor('#E3F2FD')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#90CAF9')),
    ])
    table.setStyle(table_style)

    story.append(table)
    doc.build(story)
    buffer.seek(0)
    return buffer


def generate_teacher_timetable_pdf(teacher, semester):
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        rightMargin=1 * cm,
        leftMargin=1 * cm,
        topMargin=1 * cm,
        bottomMargin=1 * cm
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Title'],
        fontSize=18,
        spaceAfter=20,
        alignment=TA_CENTER
    )

    story = []
    title = Paragraph(f"教师课表 - {teacher.name} ({semester.name})", title_style)
    story.append(title)
    story.append(Spacer(1, 0.5 * cm))

    days = ['星期一', '星期二', '星期三', '星期四', '星期五']
    if semester.weekly_days >= 6:
        days.append('星期六')
    if semester.weekly_days >= 7:
        days.append('星期日')

    periods = []
    for p in semester.daily_periods:
        default_name = f"第{p.get('order', len(periods) + 1)}节"
        periods.append(p.get('name', default_name))
    if not periods:
        periods = [f'第{i+1}节' for i in range(7)]

    schedule_grid = [[''] + days]
    for period_name in periods:
        row = [period_name]
        for _ in days:
            row.append('')
        schedule_grid.append(row)

    entries = ScheduleEntry.objects.filter(
        teacher=teacher,
        semester=semester
    ).select_related('course', 'class_id', 'classroom')

    for entry in entries:
        try:
            row_idx = entry.period
            col_idx = entry.day_of_week
            if 1 <= row_idx <= len(periods) and 1 <= col_idx <= len(days):
                content = (
                    f"{entry.course.name}\n"
                    f"{entry.class_id.name}\n"
                    f"{entry.classroom.name}"
                )
                schedule_grid[row_idx][col_idx] = content
        except IndexError:
            continue

    col_widths = [2 * cm] + [(doc.width / len(days))] * len(days)
    row_heights = [1 * cm] + [1.8 * cm] * len(periods)

    table = Table(schedule_grid, colWidths=col_widths, rowHeights=row_heights)
    table_style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#388E3C')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('BACKGROUND', (0, 1), (0, -1), colors.HexColor('#E8F5E9')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#A5D6A7')),
    ])
    table.setStyle(table_style)

    story.append(table)
    doc.build(story)
    buffer.seek(0)
    return buffer


def generate_classroom_timetable_pdf(classroom, semester):
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        rightMargin=1 * cm,
        leftMargin=1 * cm,
        topMargin=1 * cm,
        bottomMargin=1 * cm
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Title'],
        fontSize=18,
        spaceAfter=20,
        alignment=TA_CENTER
    )

    story = []
    title = Paragraph(f"教室课表 - {classroom.name} ({semester.name})", title_style)
    story.append(title)
    story.append(Spacer(1, 0.5 * cm))

    days = ['星期一', '星期二', '星期三', '星期四', '星期五']
    if semester.weekly_days >= 6:
        days.append('星期六')
    if semester.weekly_days >= 7:
        days.append('星期日')

    periods = []
    for p in semester.daily_periods:
        default_name = f"第{p.get('order', len(periods) + 1)}节"
        periods.append(p.get('name', default_name))
    if not periods:
        periods = [f'第{i+1}节' for i in range(7)]

    schedule_grid = [[''] + days]
    for period_name in periods:
        row = [period_name]
        for _ in days:
            row.append('')
        schedule_grid.append(row)

    entries = ScheduleEntry.objects.filter(
        classroom=classroom,
        semester=semester
    ).select_related('course', 'class_id', 'teacher')

    for entry in entries:
        try:
            row_idx = entry.period
            col_idx = entry.day_of_week
            if 1 <= row_idx <= len(periods) and 1 <= col_idx <= len(days):
                content = (
                    f"{entry.course.name}\n"
                    f"{entry.class_id.name}\n"
                    f"{entry.teacher.name}"
                )
                schedule_grid[row_idx][col_idx] = content
        except IndexError:
            continue

    col_widths = [2 * cm] + [(doc.width / len(days))] * len(days)
    row_heights = [1 * cm] + [1.8 * cm] * len(periods)

    table = Table(schedule_grid, colWidths=col_widths, rowHeights=row_heights)
    table_style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E64A19')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('BACKGROUND', (0, 1), (0, -1), colors.HexColor('#FBE9E7')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#FFAB91')),
    ])
    table.setStyle(table_style)

    story.append(table)
    doc.build(story)
    buffer.seek(0)
    return buffer
