import React from 'react';

function GanttChart({ tasks }) {
  if (tasks.length === 0) {
    return <div className="gantt-empty">Нет данных для отображения</div>;
  }

  const dates = tasks.flatMap(t => [
    new Date(t.start_date),
    new Date(t.end_date)
  ]);
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24));

  const getBarStyle = (task) => {
    const start = new Date(task.start_date);
    const end = new Date(task.end_date);
    const startOffset = Math.ceil((start - minDate) / (1000 * 60 * 60 * 24));
    const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    
    return {
      left: `${(startOffset / totalDays) * 100}%`,
      width: `${(duration / totalDays) * 100}%`
    };
  };

  return (
    <div className="gantt-chart">
      <h3>Диаграмма Ганта</h3>
      <div className="gantt-timeline">
        {tasks.map(task => (
          <div key={task.id} className="gantt-row">
            <div className="gantt-label">{task.code}</div>
            <div className="gantt-bar-container">
              <div 
                className="gantt-bar" 
                style={getBarStyle(task)}
                title={`${task.name}\n${task.start_date} - ${task.end_date}`}
              >
                <span className="gantt-bar-text">{task.name}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default GanttChart;
