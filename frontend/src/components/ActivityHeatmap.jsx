const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function getLevel(count) {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 7) return 3;
  return 4;
}

export default function ActivityHeatmap({
  activity = [],
  year,
  onSelect,
  selected,
  today,
}) {
  const numericYear = Number(year);
  const activityMap = new Map(activity.map((item) => [item.day, item]));

  const firstDay = new Date(Date.UTC(numericYear, 0, 1));
  const start = new Date(firstDay);

  start.setUTCDate(start.getUTCDate() - start.getUTCDay());

  const end = new Date(Date.UTC(numericYear, 11, 31));
  end.setUTCDate(end.getUTCDate() + 6 - end.getUTCDay());

  const cells = [];

  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const day = cursor.toISOString().slice(0, 10);
    const item = activityMap.get(day);

    cells.push({
      day,
      outside: cursor.getUTCFullYear() !== numericYear,
      count: Number(item?.submissions || 0),
      accepted: Number(item?.accepted || 0),
    });
  }

  const weekCount = cells.length / 7;

  const monthLabels = MONTH_NAMES.map((name, monthIndex) => {
    const monthStart = new Date(Date.UTC(numericYear, monthIndex, 1));

    const daysFromStart = Math.round(
      (monthStart.getTime() - start.getTime()) / 86400000,
    );

    return {
      name,
      column: Math.floor(daysFromStart / 7) + 1,
    };
  });

  const monthStartColumns = new Set(
    monthLabels.slice(1).map((month) => month.column),
  );

  const calendarColumns = Array.from({ length: weekCount }, (_, index) => {
    const nextColumn = index + 2;

    return monthStartColumns.has(nextColumn)
      ? "calc(var(--calendar-cell) + 8px)"
      : "var(--calendar-cell)";
  }).join(" ");

  return (
    <div className="pd-calendar">
      <div className="pd-calendar-scroll">
        <div
          className="pd-calendar-layout"
          style={{
            "--calendar-weeks": weekCount,
            "--calendar-columns": calendarColumns,
          }}
        >
          <div className="pd-calendar-months" aria-hidden="true">
            {monthLabels.map((month) => (
              <span key={month.name} style={{ gridColumn: month.column }}>
                {month.name}
              </span>
            ))}
          </div>

          <div className="pd-calendar-weekdays" aria-hidden="true">
            <span style={{ gridRow: 2 }}>Mon</span>
            <span style={{ gridRow: 4 }}>Wed</span>
            <span style={{ gridRow: 6 }}>Fri</span>
          </div>

          <div
            className="pd-calendar-grid"
            role="group"
            aria-label={`Submission activity in ${numericYear}. Weeks run Sunday to Saturday.`}
          >
            {cells.map((cell, index) => {
              if (cell.outside) {
                return (
                  <span
                    key={cell.day}
                    className="pd-calendar-blank"
                    aria-hidden="true"
                  />
                );
              }

              const future = Boolean(today && cell.day > today);
              const label = `${cell.count} ${
                cell.count === 1 ? "submission" : "submissions"
              } on ${cell.day} · ${cell.accepted} Accepted`;

              const weekIndex = Math.floor(index / 7);
              const tooltipPosition =
                weekIndex < 5
                  ? "start"
                  : weekIndex >= weekCount - 5
                    ? "end"
                    : "center";

              return (
                <div
                  key={cell.day}
                  className="pd-calendar-cell"
                  data-tooltip-position={tooltipPosition}
                >
                  <button
                    type="button"
                    className="pd-day"
                    data-level={getLevel(cell.count)}
                    disabled={future}
                    aria-label={label}
                    aria-pressed={selected === cell.day}
                    onClick={() => onSelect?.(cell.day)}
                  />

                  {!future && (
                    <span className="pd-calendar-tooltip" aria-hidden="true">
                      {label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="pd-calendar-footer">
        <span className="pd-note">
          Click a day to view its submissions · Asia/Dhaka
        </span>

        <span
          className="pd-note pd-calendar-legend"
          aria-label="Submission activity intensity: less to more"
        >
          Less
          {[0, 1, 2, 3, 4].map((level) => (
            <span
              key={level}
              className="pd-day"
              data-level={level}
              aria-hidden="true"
            />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
