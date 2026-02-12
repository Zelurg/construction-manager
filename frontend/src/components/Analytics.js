import React, { useState, useEffect } from 'react';
import { analyticsAPI } from '../services/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

function Analytics() {
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const response = await analyticsAPI.getData();
      setAnalytics(response.data);
    } catch (error) {
      console.error('Ошибка загрузки аналитики:', error);
    }
  };

  if (!analytics) {
    return <div>Загрузка...</div>;
  }

  const progressData = [
    { name: 'Выполнено', value: analytics.total_progress_percent },
    { name: 'Осталось', value: 100 - analytics.total_progress_percent }
  ];

  const timeData = [
    { name: 'Прошло', value: analytics.time_progress_percent },
    { name: 'Осталось', value: 100 - analytics.time_progress_percent }
  ];

  const laborData = [
    { name: 'Факт', value: analytics.labor_fact },
    { name: 'Остаток', value: analytics.labor_remaining }
  ];

  const machineData = [
    { name: 'Факт', value: analytics.machine_hours_fact },
    { name: 'Остаток', value: analytics.machine_hours_remaining }
  ];

  const costData = [
    { name: 'Факт', value: analytics.cost_fact },
    { name: 'Остаток', value: analytics.cost_remaining }
  ];

  const COLORS = ['#4caf50', '#ff9800', '#f44336'];

  // Форматирование чисел с пробелами
  const formatNumber = (num) => {
    return num.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  };

  return (
    <div className="analytics">
      <h2>Аналитика проекта</h2>
      
      <div className="analytics-grid">
        {/* Выполнение по объемам */}
        <div className="analytics-card">
          <h3>Выполнение по объемам</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={progressData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({name, value}) => `${name}: ${value.toFixed(1)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {progressData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="widget-stats">
            <p><strong>План:</strong> 100%</p>
            <p><strong>Факт:</strong> {analytics.total_progress_percent.toFixed(2)}%</p>
            <p><strong>Остаток:</strong> {(100 - analytics.total_progress_percent).toFixed(2)}%</p>
          </div>
        </div>

        {/* Выполнение по срокам */}
        <div className="analytics-card">
          <h3>Выполнение по срокам</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={timeData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({name, value}) => `${name}: ${value.toFixed(1)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {timeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="widget-stats">
            <p><strong>Прошло времени:</strong> {analytics.time_progress_percent.toFixed(2)}%</p>
            <p><strong>Осталось:</strong> {(100 - analytics.time_progress_percent).toFixed(2)}%</p>
          </div>
        </div>

        {/* Трудозатраты */}
        <div className="analytics-card">
          <h3>Трудозатраты (чел.-ч)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={laborData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({name, value}) => `${name}: ${formatNumber(value)}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {laborData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatNumber(value)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="widget-stats">
            <p><strong>План:</strong> {formatNumber(analytics.labor_plan)} чел.-ч</p>
            <p><strong>Факт:</strong> {formatNumber(analytics.labor_fact)} чел.-ч</p>
            <p><strong>Остаток:</strong> {formatNumber(analytics.labor_remaining)} чел.-ч</p>
          </div>
        </div>

        {/* Машиночасы */}
        <div className="analytics-card">
          <h3>Машиночасы (маш.-ч)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={machineData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({name, value}) => `${name}: ${formatNumber(value)}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {machineData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatNumber(value)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="widget-stats">
            <p><strong>План:</strong> {formatNumber(analytics.machine_hours_plan)} маш.-ч</p>
            <p><strong>Факт:</strong> {formatNumber(analytics.machine_hours_fact)} маш.-ч</p>
            <p><strong>Остаток:</strong> {formatNumber(analytics.machine_hours_remaining)} маш.-ч</p>
          </div>
        </div>

        {/* Стоимость */}
        <div className="analytics-card">
          <h3>Стоимость (руб.)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={costData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({name, value}) => `${name}: ${formatNumber(value)}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {costData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatNumber(value)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="widget-stats">
            <p><strong>План:</strong> {formatNumber(analytics.cost_plan)} ₽</p>
            <p><strong>Факт:</strong> {formatNumber(analytics.cost_fact)} ₽</p>
            <p><strong>Остаток:</strong> {formatNumber(analytics.cost_remaining)} ₽</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
