const jwt = require('jsonwebtoken');
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const cors = require('cors');
const path = require('path');
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH; // Хеш пароля в .env
const multer = require('multer');
const AUTO_BOOK_DAYS = 2; // За сколько дней запретить бронь
const checktime = 10 * 60 * 1000; //периодичность проверки (10 мин.) автобронирования
const backtime = '0 22 1 * *'; //бэкап каждый 1 день месяца в 22 часа ('0 22 1 * *')
const nodemailer = require('nodemailer'); //для отправки почты (см. "service:" в const emailTransporter) и в .env
const app = express();
const helmet = require('helmet');
const schedule = require('node-schedule');
const fs = require('fs').promises;
const fsSync = require('fs');

// Конфигурация автоматической очистки
const CLEANUP_CONFIG = {
  ENABLED: true, // Включить автоматическую очистку
  MAX_EVENTS: 1200, // Максимальное количество мероприятий
  DELETE_COUNT: 300, // Сколько удалять при превышении
  BACKUP_BEFORE_CLEANUP: true, // Создавать бэкап
  SCHEDULE: '0 3 2 * *' // 2-е число каждого месяца в 3:00 ночи ('0 3 2 * *')
};

// Настройка хранилища для загружаемых файлов
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads')) // Используем абсолютный путь
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 } // Лимит 15MB
});

// Настройка почтового транспорта (могут плохо работать с VPN)
const emailTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST, // SMTP-сервер Mail.ru
    port: process.env.EMAIL_PORT, // Порт для SSL
    secure: true, // Используем SSL
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Проверка подключения при запуске
emailTransporter.verify(function(error, success) {
    if (error) {
        console.error('*X* Ошибка подключения к почтовому серверу:', error);
    } else {
        console.log('*V* Почтовый сервер готов к отправке писем');
		console.log('');
    }
});

console.log('Email настроен для:', process.env.EMAIL_USER);

// Инициализация базы данных
const adapter = new FileSync('./data/db.json');
const db = low(adapter);

const bcrypt = require('bcrypt');

// Инициализация базы данных с default значениями
db.defaults({
    events: [
        {
            id: '1',
            title: 'Литературный кружок',
            description: 'Обсуждение современных произведений',
            start: '2025-06-01T16:00:00',
            end: '2025-06-01T17:30:00',
            duration: 90,
            minAge: 6,
            maxAge: 12,
            theme: 'literature',
            images: ['https://example.com/image1.jpg'],
			imagesDescription: 'авторские права не нарушены',
            status: 'free',
			priceType: 'gratis',
			price: 0
        },
        {
            id: '2',
            title: 'Научный клуб для детей',
            description: 'Интересные эксперименты для детей',
            start: '2025-06-02T10:00:00',
            end: '2025-06-02T11:00:00',
            duration: 60,
            minAge: 6,
            maxAge: 12,
            theme: 'science',
            images: ['https://example.com/image2.jpg'],
			imagesDescription: 'авторские права не нарушены',
            status: 'booked',
			priceType: 'paid',
			price: 500 
        }
    ],
    bookings: [
        {
            id: '1',
            eventId: '2',
            userName: 'Иванова Мария',
            organization: 'Школа №5',
            participantsAge: '7-8 лет',
            phone: '+79123456789',
            comments: 'Придем классом',
			adminComments: '',
            status: 'confirmed'
        }
    ]
}).write();

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors({
  origin: process.env.FRONTEND_URL, // Используем переменную окружения из .env
  credentials: true
}));
app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));
app.set('trust proxy',true);

// Для существующих мероприятий
db.get('events')
  .each(event => {
      if (event.minage && !event.minAge) {
          event.minAge = event.minage;
          delete event.minage;
      }
      if (event.maxage && !event.maxAge) {
          event.maxAge = event.maxage;
          delete event.maxage;
      }
      if (event.imagesDescription === undefined) {
          db.get('events')
            .find({ id: event.id })
            .assign({ imagesDescription: '' })
            .write();
      }
	  if (event.visible === undefined) {
          db.get('events')
            .find({ id: event.id })
            .assign({ visible: true })
            .write();
      }
  })
.write();
  
function initializeEventPriceFields() {
	const events = db.get('events').value();
	let updatedCount = 0;
	
	events.forEach(event => {
		let needsUpdate = false;
		
		// Проверяем и инициализируем priceType
		if (!event.priceType) {
			event.priceType = 'paid'; // По умолчанию платные
			needsUpdate = true;
		}
		
		// Проверяем и инициализируем price
		if (event.price === undefined || event.price === null) {
			event.price = 500; // Цена по умолчанию
			needsUpdate = true;
		}
		
		// Обновляем запись в базе данных если нужно
		if (needsUpdate) {
			db.get('events')
				.find({ id: event.id })
				.assign({ 
					priceType: event.priceType,
					price: event.price
				})
				.write();
			updatedCount++;
		}
	});
	
	if (updatedCount > 0) {
		console.log(`Initialized price fields for ${updatedCount} events`);
	} else {
		console.log('All events already have proper price fields');
	}
}

initializeEventPriceFields();
  
  // функция автоматического бронирования за AUTO_BOOK_DAYS дней
function checkAndAutoBookEvents() {
	console.log('Запущена функция автоматического бронирования');
	const now = new Date();
	const autoBookDate = new Date(now.getTime() + AUTO_BOOK_DAYS * 24 * 60 * 60 * 1000);

	const eventsToAutoBook = db.get('events')
	.filter(event => {
		const eventDate = new Date(event.start);
		return event.status === 'free' && 
			eventDate <= autoBookDate && 
			eventDate > autoBookDate - checktime - 60000; //добавляем ещё время на работу сервера
	})
	.value();

	eventsToAutoBook.forEach(event => {
	// Создаем автоматическое бронирование
	const newBooking = {
		id: `auto-${Date.now()}-${event.id}`,
		eventId: event.id,
		userName: 'Автоматическое бронирование',
		organization: 'Система',
		participantsAge: `${event.minAge}-${event.maxAge} лет`,
		phone: 'не указан',
		comments: 'Автоматическое бронирование за 2 дня до мероприятия',
		responsible: event.responsible,
		status: 'pending',
		createdAt: new Date().toISOString(),
		adminComments: 'Автоматически создано системой'
	};

	db.get('bookings').push(newBooking).write();
	db.get('events').find({ id: event.id }).assign({ status: 'pending' }).write();
	});
}

// Функция для создания бэкапа
async function createDatabaseBackup() {
  try {
    const backupDir = path.join(__dirname, 'backups');
    if (!fsSync.existsSync(backupDir)) {
      fsSync.mkdirSync(backupDir, { recursive: true });
    }
    
    const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	const timestamp = `${year}-${month}-${day}--${hours}-${minutes}`;
    const backupFile = path.join(backupDir, `backup-${timestamp}.json`);
    
    const dbData = JSON.stringify(db.getState(), null, 2);
    await fs.writeFile(backupFile, dbData);
    
    return backupFile;
  } catch (error) {
    console.error('*Х* Ошибка при создании бэкапа:', error);
    return null;
  }
}

// Функция для очистки старых мероприятий
async function cleanupOldEvents() {
  try {
    const events = db.get('events').value();
    
    if (events.length <= CLEANUP_CONFIG.MAX_EVENTS) {
      return {
        cleaned: false,
        eventsCount: events.length,
        message: 'Очистка не требуется'
      };
    }
    
    console.log(`*О* Начало очистки БД: ${events.length} мероприятий (превышение лимита ${CLEANUP_CONFIG.MAX_EVENTS})`);
    
    // Создаем бэкап
    let backupFile = null;
    if (CLEANUP_CONFIG.BACKUP_BEFORE_CLEANUP) {
      backupFile = await createDatabaseBackup();
    }
    
    // Находим самые ранние мероприятия
    const sortedEvents = events.sort((a, b) => {
      return new Date(a.start) - new Date(b.start);
    });
    
    const eventsToDelete = sortedEvents.slice(0, CLEANUP_CONFIG.DELETE_COUNT);
    const eventIdsToDelete = eventsToDelete.map(e => e.id);
    
    // Удаляем связанные бронирования
    const relatedBookings = db.get('bookings')
      .filter(booking => eventIdsToDelete.includes(booking.eventId))
      .value();
    
    if (relatedBookings.length > 0) {
      db.get('bookings')
        .remove(booking => eventIdsToDelete.includes(booking.eventId))
        .write();
    }
    
    // Удаляем мероприятия
    db.get('events')
      .remove(event => eventIdsToDelete.includes(event.id))
      .write();
    
    const remainingEvents = db.get('events').value().length;
    console.log(`*V* Очистка завершена. Осталось мероприятий: ${remainingEvents}`);
    
    return {
      cleaned: true,
      eventsDeleted: eventsToDelete.length,
      bookingsDeleted: relatedBookings.length,
      remainingEvents: remainingEvents,
      backupFile: backupFile,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('*X* Ошибка при очистке БД:', error);
    return {
      cleaned: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Настройка планировщика для ежемесячной очистки
function setupMonthlyCleanup() {
  if (!CLEANUP_CONFIG.ENABLED) {
    console.log('⏰ Автоматическая очистка отключена, планировщик не запущен');
    return;
  }
  
  // Расписание: 2-е число каждого месяца в 3:00 ночи
  const job = schedule.scheduleJob(CLEANUP_CONFIG.SCHEDULE, async function() {
    console.log('⏰ Запуск ежемесячной проверки БД по расписанию');
    
    try {
      const result = await checkAndCleanIfNeeded();
      
      if (result.cleaned) {
        console.log(`*V* Ежемесячная очистка выполнена. Удалено: ${result.eventsDeleted} мероприятий, ${result.bookingsDeleted} бронирований`);
      } else {
        console.log(`*i* Ежемесячная проверка: ${result.message}`);
      }
      
    } catch (error) {
      console.error('*X* Ошибка при ежемесячной очистке:', error);
    }
  });
  
  console.log(`⏰ Планировщик очистки настроен: ${CLEANUP_CONFIG.SCHEDULE} (2-е число каждого месяца в 3:00)`);
  return job;
}

// Функция для проверки необходимости очистки
async function checkAndCleanIfNeeded() {
  if (!CLEANUP_CONFIG.ENABLED) {
    return { cleaned: false, reason: 'disabled' };
  }
  
  const events = db.get('events').value();
  
  if (events.length > CLEANUP_CONFIG.MAX_EVENTS) {
    return await cleanupOldEvents();
  }
  
  return {
    cleaned: false,
    eventsCount: events.length,
    message: 'Лимит не превышен'
  };
}

// Функция отправки уведомления о бронировании
async function sendBookingNotificationToAdmin(booking, event) {
    try {
        // Проверяем что email настроен
        if (!process.env.EMAIL_USER || !process.env.ADMIN_EMAIL) {
            console.warn('*!* Email не настроен. Пропускаем отправку уведомления.');
            return;
        }

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.ADMIN_EMAIL,
            subject: `📚 Новое бронирование: ${event.title}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: #f36f21; color: white; padding: 20px; text-align: center;">
                        <h1>📚 Библиотека книжных героев</h1>
                        <h2>Новое бронирование мероприятия</h2>
						<h3><a href="vbkg.pr-cbs.ru">vbkg.pr-cbs.ru</a></h3>
                    </div>
                    
                    <div style="padding: 20px;">
                        <div style="background: #e9f7ef; padding: 15px; border-radius: 5px; margin: 10px 0;">
                            <h3>🎭 Мероприятие</h3>
                            <p><strong>Название:</strong> ${event.title}</p>
                            <p><strong>Дата и время:</strong> ${new Date(event.start).toLocaleString('ru-RU')}</p>
                            <p><strong>Продолжительность:</strong> ${event.duration} минут</p>
                            <p><strong>Возраст:</strong> ${event.minAge}-${event.maxAge} лет</p>
							<p><strong>Ответственный:</strong> ${event.responsible || 'Не назначен'}</p>
							<p><strong>Стоимость:</strong> ${event.price || '0'} руб. </p>
                        </div>
                        
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0;">
                            <h3>👤 Бронирование</h3>
                            <p><strong>Имя:</strong> ${booking.userName}</p>
                            <p><strong>Организация:</strong> ${booking.organization || 'Не указана'}</p>
                            <p><strong>Возраст участников:</strong> ${booking.participantsAge}</p>
                            <p><strong>Количество:</strong> ${booking.participantsCount} чел.</p>
                            <p><strong>Телефон:</strong> ${booking.phone}</p>
                            <p><strong>Email:</strong> ${booking.comments || 'Не указан'}</p>
                            <p><strong>Когда забронировал:</strong> ${new Date(booking.createdAt).toLocaleString('ru-RU')}</p>
                        </div>
                    </div>
                </div>
            `
        };

        await emailTransporter.sendMail(mailOptions);
        console.log('*V* Уведомление о бронировании отправлено на:', process.env.ADMIN_EMAIL);
        
    } catch (error) {
        console.error('*X* Ошибка отправки уведомления:', error);
    }
}

// Настройка планировщика для ежемесячного бэкапа
function setupMonthlyBackup() {
  try {
    // Расписание: 1-е число каждого месяца в 22:00
    // Формат: 'минуты часы день-месяца месяц день-недели'
    // 0 22 1 * * = в 22:00, 1-го числа, любого месяца, любого дня недели
    const backupJob = schedule.scheduleJob(backtime, async function() {
      
      try {
        const backupFile = await createDatabaseBackup();
        
        if (backupFile) {
          console.log(`*V* Ежемесячный бэкап успешно создан: ${backupFile}`);
          
        } else {
          console.log('*X* Не удалось создать ежемесячный бэкап');
        }
        
      } catch (error) {
        console.error('*X* Ошибка при выполнении ежемесячного бэкапа:', error);
      }
    });
    
    console.log('*O* Планировщик ежемесячного бэкапа настроен: 1-е число каждого месяца в 22:00');
    return backupJob;
    
  } catch (error) {
    console.error('*X* Ошибка при настройке планировщика бэкапа:', error);
    return null;
  }
}

// Проверяем при старте сервера
checkAndAutoBookEvents();
// Бэкапим при старте сервера
createDatabaseBackup();

// Запускаем периодическую проверку
setInterval(checkAndAutoBookEvents, checktime);

// API для мероприятий
app.get('/api/events', (req, res) => {
    let events = db.get('events').value();
    
	events = events.filter(event => {
        return event.visible !== false;
    });
	
	// Добавляем гарантированное поле imagesDescription
    events = events.map(event => ({
        ...event,
        extendedProps: {
            ...event.extendedProps,
            imagesDescription: event.imagesDescription || event.extendedProps?.imagesDescription || ''
        }
    }));
	
	// Фильтрация по стоимости
    if (req.query.priceType && req.query.priceType !== 'all') {
        events = events.filter(event => {
            const eventPriceType = event.priceType === 'free' ? 'gratis' : event.priceType;
            const filterPriceType = req.query.priceType === 'free' ? 'gratis' : req.query.priceType;
            return eventPriceType === filterPriceType;
        });
    }
	
    // Фильтрация по дате
    if (req.query.start && req.query.end) {
        events = events.filter(event => {
            const eventStart = new Date(event.start);
            const start = new Date(req.query.start);
            const end = new Date(req.query.end);
            return eventStart >= start && eventStart <= end;
        });
    }
    
    // Фильтрация по возрасту
    if (req.query.minAge && req.query.maxAge) {
        events = events.filter(event => {
            return event.maxAge >= parseInt(req.query.minAge) && 
                   event.minAge <= parseInt(req.query.maxAge);
        });
    }
    
    // Фильтрация по продолжительности
    if (req.query.duration) {
        const duration = parseInt(req.query.duration);
        events = events.filter(event => event.duration <= duration);
    }
    
    // Фильтрация по тематике
    if (req.query.theme) {
        events = events.filter(event => event.theme === req.query.theme);
    }
    
    // Форматирование для FullCalendar
    const formattedEvents = events.map(event => ({
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        extendedProps: {
            description: event.description,
            duration: event.duration,
            minAge: event.minAge,
			maxAge: event.maxAge,
            theme: event.theme,
            images: event.images,
			imagesDescription: event.imagesDescription || event.extendedProps?.imagesDescription || '',
            status: event.status,
			priceType: event.priceType,
            price: event.price
        },
        className: `fc-event-${event.priceType || 'gratis'} ${event.status === 'booked' ? 'booked' : event.status === 'pending' ? 'pending' : 'free'}`
    }));
    
    res.json(formattedEvents);
});

app.patch('/api/events/:id/visibility', isAdmin, (req, res) => {
    try {
        const eventId = req.params.id;
        const { visible } = req.body;
        
        console.log(`Updating visibility for event ${eventId} to:`, visible);
        
        const event = db.get('events').find({ id: eventId }).value();
        if (!event) {
            console.log('Event not found:', eventId);
            return res.status(404).json({ message: 'Мероприятие не найдено' });
        }
        
        // Обновляем в базе данных
        db.get('events')
          .find({ id: eventId })
          .assign({ visible: Boolean(visible) }) // Гарантируем boolean
          .write();
        
        // Проверяем что обновилось
        const updatedEvent = db.get('events').find({ id: eventId }).value();
        console.log('Event after update:', updatedEvent);
        
        res.json({ 
            success: true, 
            message: `Мероприятие ${visible ? 'показано' : 'скрыто'}` 
        });
    } catch (err) {
        console.error('Error updating event visibility:', err);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Получить все мероприятия (для админки)
app.get('/api/events/all', isAdmin, (req, res) => {
	console.log('Accessing events with token:', req.headers.authorization);
    const events = db.get('events').value();
    res.json(events);
});

app.get('/api/admin/events', isAdmin, (req, res) => {
  try {
    const events = db.get('events').value();
    console.log(`Returning ${events.length} events`);
    res.json(events);
  } catch (err) {
    console.error('Error getting events:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Получить все бронирования (для админки)
app.get('/api/admin/bookings', isAdmin, (req, res) => {
  try {
    const bookings = db.get('bookings').value();
    console.log(`Returning ${bookings.length} bookings`);
    res.json(bookings);
  } catch (err) {
    console.error('Error getting bookings:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API для входа администратора
app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body;
  
  // Проверяем пароль через bcrypt.compare (вместо прямого сравнения)
  const isPasswordValid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  
  if (isPasswordValid) {
    const token = jwt.sign(
      { admin: true },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    return res.json({ success: true, token });
  }
  
  // Унифицированное сообщение об ошибке (не раскрываем детали)
  res.status(401).json({ 
    success: false, 
    message: 'Ошибка аутентификации' 
  });
});

// Middleware для проверки администратора
function isAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Требуется авторизация' });
    }

    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.admin) {
            req.user = decoded; // Добавляем декодированные данные в запрос
            return next();
        }
        return res.status(403).json({ message: 'Недостаточно прав' });
    } catch (err) {
        console.error('Token verification failed:', err);
        return res.status(403).json({ message: 'Неверный токен' });
    }
}

// Добавить мероприятие
app.post('/api/events', isAdmin, upload.array('images'), (req, res) => {
    try {
        // Обработка загруженных файлов
        const uploadedImages = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];
        
        // Обработка скопированных картинок - ПРОСТАЯ ЛОГИКА
        let copiedImages = [];
        if (req.body.copiedImages) {
            // Если это массив
            if (Array.isArray(req.body.copiedImages)) {
                copiedImages = req.body.copiedImages;
            } else {
                // Если это одиночное значение
                copiedImages = [req.body.copiedImages];
            }
        }
        
        const allImages = [...uploadedImages, ...copiedImages];
        
        console.log('Creating event with images:', {
            uploaded: uploadedImages.length,
            copied: copiedImages.length,
            total: allImages.length
        });

        const startDate = new Date(`${req.body.date}T${req.body.time}`);
        const duration = parseInt(req.body.duration) || 60;
        const visible = req.body.visible === 'true';
		
        const newEvent = {
            id: Date.now().toString(),
            title: req.body.title,
            description: req.body.description,
            start: startDate.toISOString(),
            end: new Date(startDate.getTime() + duration * 60000).toISOString(),
            duration: duration,
            minAge: parseInt(req.body.minAge) || 0,
            maxAge: parseInt(req.body.maxAge) || 14,
            theme: req.body.theme,
            images: allImages, // ВСЕ КАРТИНКИ
            imagesDescription: req.body.imagesDescription || '',
            status: 'free',
            responsible: req.body.responsible || null,
            priceType: req.body.priceType || 'gratis',
            price: req.body.priceType === 'paid' ? parseInt(req.body.price) || 500 : 0,
			visible: visible
        };
        
        db.get('events').push(newEvent).write();
        res.json(newEvent);
        
    } catch (error) {
        console.error('Ошибка при создании мероприятия (Error creating event):', error);
        res.status(500).json({ message: 'Ошибка при создании мероприятия' });
    }
});

// Удалить мероприятие
app.delete('/api/events/:id', isAdmin, (req, res) => {
    try {
        const eventId = req.params.id;
        
        // 1. Находим все связанные бронирования
        const relatedBookings = db.get('bookings')
            .filter({ eventId })
            .value();
        
        // 2. Удаляем связанные бронирования
        db.get('bookings')
            .remove({ eventId })
            .write();
        
        // 3. Удаляем само мероприятие
        db.get('events')
            .remove({ id: eventId })
            .write();
        
        // 4. Возвращаем информацию об удаленных записях
        res.json({
            success: true,
            deletedEvent: eventId,
            deletedBookings: relatedBookings.map(b => b.id),
            message: `Удалено мероприятие и ${relatedBookings.length} связанных бронирований`
        });
    } catch (error) {
        console.error('Delete event error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка при удалении мероприятия'
        });
    }
});

app.get('/api/events/public', (req, res) => {
    try {
        let events = db.get('events').value();
        
        // Фильтрация и валидация событий
        events = events
            .filter(event => {
                // Проверяем обязательные поля
                if (!event.id || !event.title || !event.start) {
                    console.warn('Invalid event format:', event);
                    return false;
                }
				if (event.visible === false) {
                    return false;
                }
                
                // Только будущие события
                return new Date(event.end) > new Date();
            })
            .map(event => ({
                // Гарантируем наличие всех необходимых полей
                id: event.id,
                title: event.title || 'Без названия',
                start: event.start,
                end: event.end,
                extendedProps: {
                    description: event.description || 'Описание отсутствует',
                    duration: event.duration || 60,
                    minAge: event.minAge || event.minage || 0,
					maxAge: event.maxAge || event.maxage || 14,
                    theme: event.theme || 'Не указана',
                    images: event.images || [],
                    status: event.status || 'free',
					imagesDescription: event.imagesDescription || event.extendedProps?.imagesDescription || '',
					priceType: event.priceType || 'gratis',
                    price: event.price || null,
					visible: event.visible !== false
                },
				priceType: event.priceType || 'gratis',
                price: event.price || null,
                className: event.status === 'booked' ? 'booked' : 
                          event.status === 'pending' ? 'pending' : 'free'
            }));
        
        res.json(events);
    } catch (err) {
        console.error('Error getting public events:', err);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

app.put('/api/events/:id', isAdmin, upload.array('images'), async (req, res) => {
    try {
        const eventId = req.params.id;
        const event = db.get('events').find({ id: eventId }).value();

        if (!event) {
            return res.status(404).json({ message: 'Мероприятие не найдено' });
        }
		const { visible } = req.body;
        console.log('Received visible:', visible);

        // Получаем данные из формы
        const start = new Date(`${req.body.date}T${req.body.time}`);
        const duration = parseInt(req.body.duration) || 60;
        const end = new Date(start.getTime() + duration * 60000);

        // Обновляем мероприятие
        const updatedEvent = {
            ...event,
            title: req.body.title,
            description: req.body.description,
            start: start.toISOString(),
            end: end.toISOString(),
            duration: duration,
            minAge: req.body.minAge,
			maxAge: req.body.maxAge,
            theme: req.body.theme,
			imagesDescription: req.body.imagesDescription || event.imagesDescription || '',
            responsible: req.body.responsible || null,
			visible: visible === 'true',
			priceType: req.body.priceType,
			price: req.body.price,
            lastModified: new Date().toISOString()
        };

        // Добавляем новые изображения
        if (req.files && req.files.length > 0) {
            updatedEvent.images = [
                ...(event.images || []),
                ...req.files.map(file => `/uploads/${file.filename}`)
            ];
        }

        db.get('events')
            .find({ id: eventId })
            .assign(updatedEvent)
            .write();

        res.json(updatedEvent);
    } catch (error) {
        console.error('Error updating event:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

app.delete('/api/events/:id/images', isAdmin, (req, res) => {
    try {
        const eventId = req.params.id;
        const { imageUrl } = req.body;

        db.get('events')
            .find({ id: eventId })
            .update('images', images => images.filter(img => img !== imageUrl))
            .write();

        // Здесь можно добавить удаление физического файла
        // fs.unlinkSync(path.join(__dirname, imageUrl));

        res.json({ success: true });
    } catch (error) {
        console.error('Error removing image:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

app.post('/api/admin/refresh', (req, res) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Требуется авторизация' });
    }

    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        if (decoded.admin) {
            // Генерируем новый токен
            const newToken = jwt.sign(
                { admin: true },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );
            
            return res.json({ token: newToken });
        }
        
        return res.status(403).json({ message: 'Недостаточно прав' });
    } catch (err) {
        console.error('Token verification failed:', err);
        return res.status(403).json({ message: 'Неверный токен' });
    }
});

function isAdminRequest(req) {
    return req.headers.authorization?.startsWith('Bearer ');
}

// Получение информации о конкретном мероприятии
app.get('/api/events/:id', (req, res) => {
    try {
        const event = db.get('events')
            .find({ id: req.params.id })
            .value();

        if (!event) {
            return res.status(404).json({ message: 'Мероприятие не найдено' });
        }

        // Для администраторов возвращаем полные данные
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            return res.json(event);
        }

        // Для обычных пользователей возвращаем только публичные данные
        const publicEvent = {
            id: event.id,
            title: event.title,
            start: event.start,
            end: event.end,
            description: event.description,
            minAge: event.minAge,
			maxAge: event.maxAge,
            theme: event.theme,
            images: event.images,
			imagesDescription: req.body.imagesDescription || event.imagesDescription,
            status: event.status
        };

        res.json(publicEvent);
    } catch (error) {
        console.error('Error getting event:', error);
        res.status(500).json({ 
            success: false,
            message: 'Внутренняя ошибка сервера',
            error: error.message
        });
    }
});

// Получение информации о конкретном бронировании
app.get('/api/bookings/:id', (req, res) => {
    try {
        const booking = db.get('bookings')
            .find({ id: req.params.id })
            .value();

        if (!booking) {
            return res.status(404).json({ message: 'Бронирование не найдено' });
        }

        res.json(booking);
    } catch (error) {
        console.error('Error getting booking:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// API для бронирований
app.get('/api/bookings', isAdmin, (req, res) => {
    const bookings = db.get('bookings').value();
    res.json(bookings);
});

// Создать бронирование
app.post('/api/bookings', async (req, res) => {
    try {
        const event = db.get('events').find({ id: req.body.eventId }).value();
        
        if (!event) {
            return res.status(404).json({ message: 'Мероприятие не найдено' });
        }
        
        if (event.status !== 'free') {
            return res.status(400).json({ message: 'Мероприятие уже занято' });
        }
        
        const newBooking = {
            id: Date.now().toString(),
            eventId: req.body.eventId,
            userName: req.body.userName,
            organization: req.body.organization || '',
            participantsAge: req.body.participantsAge,
            phone: req.body.phone,
            comments: req.body.comments || '',
            status: 'pending',
			participantsCount: req.body.participantsCount, //количество участников
            createdAt: new Date().toISOString()
        };
        
        db.get('bookings').push(newBooking).write();
        db.get('events').find({ id: req.body.eventId }).assign({ status: 'pending' }).write();
        
		
        // Отправляем уведомление (если email настроен)
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            sendBookingNotificationToAdmin(newBooking, event);
        } else {
            console.warn('*!* Email не настроен. Уведомление не отправлено.');
        }
		
        res.json({ 
            success: true, 
            message: 'Бронирование создано! Ожидайте письмо.'
        });
    } catch (error) {
        console.error('Booking error:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Подтвердить бронирование
app.put('/api/bookings/:id/approve', isAdmin, (req, res) => {
    const booking = db.get('bookings').find({ id: req.params.id }).value();
    
    if (!booking) {
        return res.status(404).json({ message: 'Бронирование не найдено' });
    }
    
    db.get('bookings')
        .find({ id: req.params.id })
        .assign({ status: 'confirmed' })
        .write();
    
    // Обновляем статус мероприятия
    db.get('events')
        .find({ id: booking.eventId })
        .assign({ status: 'booked' })
        .write();
    
    res.json({ success: true });
});

// Удалить бронирование
app.delete('/api/bookings/:id', isAdmin, (req, res) => {
    try {
        const bookingId = req.params.id;
        const booking = db.get('bookings').find({ id: bookingId }).value();
        
        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'Бронирование не найдено' 
            });
        }
        
        // 1. Удаляем бронирование
        db.get('bookings').remove({ id: bookingId }).write();
        
        // 2. Обновляем статус мероприятия на "свободно"
        db.get('events')
            .find({ id: booking.eventId })
            .assign({ status: 'free' })
            .write();
        
        res.json({ 
            success: true,
            message: 'Бронирование удалено, мероприятие освобождено',
            eventId: booking.eventId
        });
    } catch (error) {
        console.error('Delete booking error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Ошибка при удалении бронирования' 
        });
    }
});

app.patch('/api/bookings/:id/comments', isAdmin, (req, res) => {
    try {
        const bookingId = req.params.id;
        const { adminComments } = req.body;
        
        db.get('bookings')
            .find({ id: bookingId })
            .assign({ adminComments })
            .write();
            
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating comments:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Отдача статики
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сайт бронирования запущен. Порт: ${PORT}`);
	console.log(`Хост: ${process.env.FRONTEND_URL}`);
	// Запускаем планировщик для ежемесячной очистки
	setupMonthlyCleanup();
	
	// Запускаем планировщик для ежемесячного бэкапа
	setupMonthlyBackup();
});

