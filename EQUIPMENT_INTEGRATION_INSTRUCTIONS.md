# Инструкция по интеграции техники в DailyOrders.js

## Шаг 1: Добавьте импорт в начало файла

Найдите строку с `import ExecutorsModal` и добавьте рядом:

```javascript
import ExecutorsModal from './ExecutorsModal';
import EquipmentUsageModal from './EquipmentUsageModal'; // ДОБАВИТЬ ЭТУ СТРОКУ
```

Также найдите импорт `executorsAPI` и добавьте:

```javascript
import { dailyAPI, scheduleAPI, executorsAPI, equipmentUsageAPI } from '../services/api'; // Добавить equipmentUsageAPI
```

## Шаг 2: Добавьте state для техники

Найдите строку с `const [showExecutorsModal, setShowExecutorsModal]` и добавьте рядом:

```javascript
const [showExecutorsModal, setShowExecutorsModal] = useState(false);
const [showEquipmentModal, setShowEquipmentModal] = useState(false); // ДОБАВИТЬ
const [executorStats, setExecutorStats] = useState(null);
const [equipmentStats, setEquipmentStats] = useState(null); // ДОБАВИТЬ
```

## Шаг 3: Добавьте загрузку статистики по технике

Найдите функцию `loadExecutorStats` и добавьте рядом:

```javascript
const loadEquipmentStats = async () => {
  try {
    const response = await equipmentUsageAPI.getStats(selectedDate);
    setEquipmentStats(response.data);
  } catch (error) {
    console.error('Ошибка загрузки статистики техники:', error);
  }
};
```

## Шаг 4: Добавьте вызов loadEquipmentStats

Найдите все места, где вызывается `loadExecutorStats()` и добавьте рядом `loadEquipmentStats()`:

```javascript
loadExecutorStats();
loadEquipmentStats(); // ДОБАВИТЬ
```

## Шаг 5: Добавьте кнопку "Указать технику"

Найдите кнопку "Указать исполнителей" и добавьте рядом:

```javascript
<button 
  onClick={() => setShowExecutorsModal(true)}
  className="btn-secondary"
>
  👥 Указать исполнителей
</button>
<button 
  onClick={() => setShowEquipmentModal(true)}
  className="btn-secondary"
>
  🚜 Указать технику
</button>
```

## Шаг 6: Добавьте отображение машиночасов в заголовок

Найдите блок с отображением трудозатрат ("Исполнители: X чел. / Y ч-ч / Z ч-ч") и добавьте рядом:

```javascript
{executorStats && (
  <span className="header-stat">
    Исполнители: 
    {executorStats.executors_count} чел. / 
    {executorStats.total_hours_worked.toFixed(1)} ч-ч / 
    {executorStats.total_labor_hours.toFixed(1)} ч-ч
  </span>
)}
{equipmentStats && (
  <span className="header-stat">
    Техника: 
    {equipmentStats.equipment_count} ед. / 
    {equipmentStats.total_machine_hours.toFixed(1)} м-ч / 
    {equipmentStats.total_work_machine_hours.toFixed(1)} м-ч
  </span>
)}
```

## Шаг 7: Добавьте модальное окно

Найдите блок с `{showExecutorsModal && ...}` и добавьте рядом:

```javascript
{showExecutorsModal && (
  <ExecutorsModal
    date={selectedDate}
    onClose={() => setShowExecutorsModal(false)}
    onUpdate={() => {
      loadWorks();
      loadExecutorStats();
    }}
  />
)}

{showEquipmentModal && (
  <EquipmentUsageModal
    date={selectedDate}
    onClose={() => setShowEquipmentModal(false)}
    onUpdate={() => {
      loadWorks();
      loadEquipmentStats();
    }}
  />
)}
```

## Сохраните изменения

После всех изменений файл `DailyOrders.js` должен содержать:

1. Импорт `EquipmentUsageModal` и `equipmentUsageAPI`
2. State `showEquipmentModal` и `equipmentStats`
3. Функцию `loadEquipmentStats`
4. Кнопку "Указать технику"
5. Отображение статистики по технике
6. Модальное окно `EquipmentUsageModal`

## Применение на сервере

```bash
cd /opt/construction-manager
git pull origin main

# Backend
cd backend
sudo systemctl restart construction-manager

# Frontend
cd ../frontend
npm run build
sudo cp -r dist/* /var/www/construction-manager/
sudo systemctl reload nginx
```

## Результат

После всех изменений в Ежедневных нарядах:

1. Появится кнопка "🚜 Указать технику"
2. В заголовке будет показываться: "Техника: 3 ед. / 24 м-ч / 30 м-ч"
3. Модальное окно позволит добавлять технику из справочника
4. Можно указывать машиночасы для каждой единицы техники
