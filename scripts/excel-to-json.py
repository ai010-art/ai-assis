# 엑셀 파일을 대시보드가 읽는 JSON으로 바꾼다. 엑셀 파일은 수정하지 않는다.
# 실행: python scripts/excel-to-json.py
import calendar
import json
from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "01_조립셀_생산실적.xlsx"
OUTPUT = ROOT / "public" / "data" / "production.json"

PRODUCTION_HEADERS = ["일자", "셀", "공정", "설비코드", "계획", "실적", "불량", "비가동(분)", "비가동 사유"]
EQUIPMENT_HEADERS = ["설비코드", "설비명", "담당자", "교정주기(개월)", "최근교정일"]


def to_day(value):
    return value.date() if isinstance(value, datetime) else value


def add_months(day, months):
    month_index = day.month - 1 + months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def check_headers(actual, expected, sheet):
    if list(actual[: len(expected)]) != expected:
        raise SystemExit(f"[{sheet}] 시트의 열 제목이 예상과 다릅니다: {actual}")


def read_production(sheet):
    check_headers([c.value for c in sheet[3]], PRODUCTION_HEADERS, "생산실적")
    rows = []
    for row in sheet.iter_rows(min_row=4, values_only=True):
        if row[0] is None:
            continue
        rows.append(
            {
                "date": to_day(row[0]).isoformat(),
                "cell": row[1],
                "process": row[2],
                "equipment": row[3],
                "plan": row[4],
                "actual": row[5],
                "defect": row[6],
                "downtime": row[7],
                "reason": row[8],
            }
        )
    return rows


def read_equipment(sheet):
    check_headers([c.value for c in sheet[1]], EQUIPMENT_HEADERS, "설비마스터")
    equipment = []
    for row in sheet.iter_rows(min_row=2, values_only=True):
        if row[0] is None:
            continue
        last = to_day(row[4])
        equipment.append(
            {
                "code": row[0],
                "name": row[1],
                "owner": row[2],
                "cycleMonths": row[3],
                "lastCalibration": last.isoformat(),
                "nextCalibration": add_months(last, row[3]).isoformat(),
            }
        )
    return equipment


def main():
    workbook = load_workbook(SOURCE, data_only=True, read_only=False)
    rows = read_production(workbook["생산실적"])
    equipment = read_equipment(workbook["설비마스터"])
    data = {
        "title": workbook["생산실적"]["A1"].value,
        "source": SOURCE.name,
        "baseDate": to_day(workbook["설비마스터"]["J1"].value).isoformat(),
        "rows": rows,
        "equipment": equipment,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"변환 완료: 생산실적 {len(rows)}행, 설비 {len(equipment)}대")


if __name__ == "__main__":
    main()
