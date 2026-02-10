document.addEventListener('DOMContentLoaded', function() {
	if (!document.getElementById('allEventsModal') || 
        !document.getElementById('allEventsTableBody')) {
        console.error('Critical HTML elements are missing!');
        return;
    }
	// Инициализация календаря
	let tooltip = document.getElementById('eventTooltip');
	let tooltipTitle = document.getElementById('tooltipTitle');
	let tooltipDescription = document.getElementById('tooltipDescription');
    let calendarEl = document.getElementById('calendar');
    let calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'ru',
		contentHeight: 'auto',
		dayHeaderFormat: { weekday: 'short' }, // Короткие названия дней недели
		height: 'auto',
		fixedWeekCount: true, // Не показывать части следующего месяца
        headerToolbar: false,
        allDaySlot: false,
		dayMaxEvents: true, // Показывать "+2 еще" если много событий
			eventTimeFormat: {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		},
		eventClick: function(info) {
            showEventInfo(info.event);
        },
        events: function(fetchInfo, successCallback, failureCallback) {
            loadEvents(fetchInfo.start, fetchInfo.end, successCallback);
        },
		eventMouseEnter: function(info) {
			showEventTooltip(info.event, info.jsEvent);
		},
		eventMouseLeave: function() {
			hideEventTooltip();
		}
    });
	
	let adminToken = null; // Будем хранить токен после входа
	let copiedImages = []; // переменная скопированных изображений
	let allEvents = []; // Глобальная переменная для хранения всех мероприятий
	let filterDebounce;
	let allAdminEvents = [];
	let allAdminBookings = [];
	
	// Установка текущего месяца в фильтре
	const monthFilter = document.getElementById('monthFilter');
	
	// Установка текущего месяца при загрузке
	monthFilter.value = new Date().getMonth();
	
	calendar.render();
	
	// Функция для выполнения авторизованных запросов
	async function makeAuthRequest(config) {
		try {
			if (!adminToken) {
				throw new Error('Требуется авторизация');
			}

			const response = await axios({
				...config,
				headers: {
					...config.headers,
					'Authorization': `Bearer ${adminToken}`
				}
			});

			return response;
		} catch (error) {
			if (error.response?.status === 401) {
				// Если токен устарел, пробуем обновить
				await tryRefreshToken();
				return makeAuthRequest(config);
			}
			if (error.response?.status === 500) {
				error.response.data = {
					message: 'Внутренняя ошибка сервера',
					details: error.response.data
				};
			}
			throw error;
		}
	}

	async function tryRefreshToken() {
		try {
			const response = await axios.post('/api/admin/refresh', {}, {
				headers: {
					'Authorization': `Bearer ${adminToken}`
				}
			});
			
			if (response.data.token) {
				adminToken = response.data.token;
				localStorage.setItem('adminToken', adminToken);
			} else {
				throw new Error('Не удалось обновить токен');
			}
		} catch (error) {
			console.error('Token refresh failed:', error);
			adminLogout();
			throw new Error('Сессия истекла. Пожалуйста, войдите снова.');
		}
	}

    // Навигация по месяцу
    document.getElementById('prevMonth').addEventListener('click', function() {
        calendar.prev();
        calendar.refetchEvents();
    });

    document.getElementById('nextMonth').addEventListener('click', function() {
       calendar.next();
        calendar.refetchEvents();
    });

	document.getElementById('showAllEvents').addEventListener('click', showAllEventsModal);
	document.getElementById('resetFilters').addEventListener('click', function() {
		// Сбрасываем значения фильтров
		document.getElementById('minAgeFilter').value = '3';
		document.getElementById('maxAgeFilter').value = '14';
		document.getElementById('durationFilter').value = 'all';
		document.getElementById('themeFilter').value = 'all';
		document.getElementById('priceFilter').value = 'all';
		
		// Устанавливаем текущий месяц в фильтре
		const currentMonth = new Date().getMonth();
		document.getElementById('monthFilter').value = currentMonth;
		
		// Возвращаем календарь к текущему месяцу
		calendar.today();
		calendar.refetchEvents();
		});
	
	// обработчики изменения для всех фильтров
	document.getElementById('minAgeFilter').addEventListener('change', function() {
		calendar.refetchEvents();
	});
	
	document.getElementById('priceFilter').addEventListener('change', function() {
		calendar.refetchEvents();
	});
	
	document.getElementById('maxAgeFilter').addEventListener('change', function() {
		calendar.refetchEvents();
	});

	document.getElementById('durationFilter').addEventListener('change', function() {
		calendar.refetchEvents();
	});

	document.getElementById('themeFilter').addEventListener('change', function() {
		calendar.refetchEvents();
	});
	


	// При загрузке страницы инициализируем обработчики
	document.addEventListener('DOMContentLoaded', function() {
		// Обработчик выбора файлов
		document.getElementById('newEventImages').addEventListener('change', function(e) {
			const files = e.target.files;
			const previewContainer = document.getElementById('imagePreviews');
			previewContainer.innerHTML = '';
			
			for (let i = 0; i < files.length; i++) {
				if (!files[i].type.match('image.*')) continue;
				
				const reader = new FileReader();
				reader.onload = function(event) {
					const preview = document.createElement('div');
					preview.className = 'position-relative me-2 mb-2';
					preview.innerHTML = `
						<img src="${event.target.result}" class="img-thumbnail" style="width: 100px; height: 100px; object-fit: cover;">
						<button class="btn btn-sm btn-danger position-absolute top-0 end-0 p-0" 
								style="width: 20px; height: 20px; font-size: 10px;"
								onclick="removeNewImagePreview(this)">
							×
						</button>
					`;
					previewContainer.appendChild(preview);
				};
				reader.readAsDataURL(files[i]);
			}
		});
	});
	
	// обработчики для очистки copiedImages при переходе на другие вкладки
	document.addEventListener('DOMContentLoaded', function() {
		const otherTabs = document.querySelectorAll('#adminTabs button[data-bs-target]:not([data-bs-target="#addEvent"])');
		otherTabs.forEach(tab => {
			tab.addEventListener('click', function() {
				if (copiedImages.length > 0) {
					console.log('Clearing copied images due to tab change');
					copiedImages = [];
					
					// Очищаем превью
					const previewContainer = document.getElementById('imagePreviews');
					if (previewContainer) previewContainer.innerHTML = '';
					
					// Удаляем сообщение
					const message = document.getElementById('copiedImagesMessage');
					if (message) {
						message.remove();
					}
				}
			});
		});
	});
	
	// Если форма в модальном окне - очистка при закрытии
	document.addEventListener('DOMContentLoaded', function() {
		const addEventModal = document.getElementById('addEventModal'); // если есть модальное окно
		if (addEventModal) {
			addEventModal.addEventListener('hidden.bs.modal', function() {
				clearAddEventForm();
			});
		}
	});
	
	// Обработчик переключения вкладок админки
	document.querySelectorAll('#adminTabs .nav-link').forEach(tab => {
		tab.addEventListener('shown.bs.tab', function(event) {
			const filtersCard = document.querySelector('.events-filters-card');
			if (event.target.getAttribute('data-bs-target') === '#addEvent') {
				filtersCard.style.display = 'none';
			} else {
				filtersCard.style.display = 'block';
			}
		});
	});
	
    // Обработчик смены вкладок
    document.querySelectorAll('.nav-link[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', function(event) {
            // При переключении вкладки применяем соответствующие фильтры
            setTimeout(applyAdminFilters, 100);
        });
    });
	
	// Удаление превью нового изображения
	window.removeNewImagePreview = function(button) {
		button.parentElement.remove();
		// Нужно также удалить файл из input.files
		updateFileInput();
	};

	// Обновление файлового input после удаления превью
	function updateFileInput() {
		const previewContainer = document.getElementById('imagePreviews');
		const input = document.getElementById('newEventImages');
		const files = input.files;
		
		// Создаем новый DataTransfer для обновления файлов
		const dataTransfer = new DataTransfer();
		
		// Сохраняем только те файлы, для которых есть превью
		Array.from(files).forEach(file => {
			if (document.querySelector(`img[src*="${file.name}"]`)) {
				dataTransfer.items.add(file);
			}
		});
		
		input.files = dataTransfer.files;
	}

	async function showAllEventsModal() {
		try {
			const response = await axios.get('/api/events/public');
			allEvents = response.data;
			
			// Сортируем мероприятия по дате (от ближайших к самым дальним)
			allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
			
			// Убедимся, что модальное окно существует
			const modalEl = document.getElementById('allEventsModal');
			if (!modalEl) {
				throw new Error('Modal element not found');
			}
	
			// Инициализация фильтров
			initFilters();
				
			// Показ модального окна
			const modal = new bootstrap.Modal(modalEl);
			modal.show();
			
			// Первоначальная отрисовка
			filterAllEvents();
			
		} catch (error) {
			console.error('Error loading events:', error);
			alert('Ошибка загрузки мероприятий: ' + error.message);
		}
	}

	function initFilters() {
	  // Установка значений по умолчанию
	  document.getElementById('filterStatus').value = 'free';
	  document.getElementById('filterTheme').value = 'all';
	  document.getElementById('filterMinAge').value = '3';
	  document.getElementById('filterMaxAge').value = '14';

	  // Добавление обработчиков изменений
	  const filters = ['filterStatus', 'filterTheme', 'filterMinAge', 'filterMaxAge'];
	  filters.forEach(id => {
		document.getElementById(id).addEventListener('change', () => {
		  filterAllEvents();
		});
	  });
	}

	window.toggleEventVisibility = async function(eventId, currentVisibility) {
		try {
			const newVisibility = !currentVisibility;
			
			console.log('Toggling visibility:', { eventId, currentVisibility, newVisibility });
			
			const response = await makeAuthRequest({
				method: 'PATCH',
				url: `/api/events/${eventId}/visibility`,
				data: { visible: newVisibility }
			});

			console.log('Server response:', response.data);

			if (response.data.success) {
				alert(response.data.message);
				// Принудительно перезагружаем данные
				await loadAdminData();
				// Обновляем календарь
				calendar.refetchEvents();
			} else {
				throw new Error(response.data.message || 'Неизвестная ошибка');
			}
		} catch (error) {
			console.error('Error toggling event visibility:', error);
			console.error('Error details:', error.response?.data);
			alert('Ошибка при изменении видимости: ' + (error.response?.data?.message || error.message));
		}
	};

	// Функция для рендеринга таблицы мероприятий
	function renderAllEventsTable(events) {
	  const tableBody = document.getElementById('allEventsTableBody');
	  if (!tableBody) return;

	  tableBody.innerHTML = events.map(event => {
		const startDate = event.start ? new Date(event.start) : null;
		const formatDateTime = (date) => {
		  if (!date) return 'Дата не указана';
		  return date.toLocaleString('ru-RU', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		  }).replace(',', '');
		};
		const dateString = formatDateTime(startDate);
		const props = event.extendedProps || {};
		const getPriceDisplay = (priceType, price) => {
		  if (priceType === 'paid' && price) {
			return `<span class="price-badge price-paid">Платно</span>`;
		  }
		  return '<span class="price-badge price-free">Бесплатно</span>';
		};

		return `
		  <tr>
			<td><a href="#" class="event-link" data-id="${event.id}">${event.title}</a></td>
			<td>${dateString}</td>
			<td>${props.minAge}-${props.maxAge}</td>
			<td>${getStatusName(props.status)}<br><small>${getPriceDisplay(props.priceType, props.price)}</small></td>
			<td>
			  ${props.status === 'free' ? 
				`<button class="btn btn-sm btn-primary book-from-list" style="font-size: 0.9rem" data-id="${event.id}">Забронировать</button>` : 
				'<span class="text-muted">Недоступно</span>'}
			</td>
		  </tr>
		`;
	  }).join('');

	  // Добавляем обработчики событий для новых элементов
	  addEventTableHandlers();
	}
	
	function toggleAdminFields(show) {
		document.getElementById('adminEventFields').classList.toggle('d-none', !show);
		document.querySelectorAll('.admin-only').forEach(el => {
			el.classList.toggle('d-none', !show);
		});
	}
	
	function addEventTableHandlers(events) {
		// Обработчик для ссылок на мероприятия
		document.querySelectorAll('.event-link').forEach(link => {
			link.addEventListener('click', (e) => {
				e.preventDefault();
				const eventId = e.target.getAttribute('data-id');
				const event = allEvents.find(ev => ev.id === eventId);
				
				if (event) {
					// Преобразуем даты перед показом
					const eventWithDates = {
						...event,
						start: event.start instanceof Date ? event.start : new Date(event.start),
						end: event.end instanceof Date ? event.end : new Date(event.end)
					};
					showEventInfo(eventWithDates);
				} else {
					alert('Информация о мероприятии не найдена');
				}
			});
		});

		// Обработчик для кнопок бронирования
		document.querySelectorAll('.book-from-list').forEach(btn => {
			btn.addEventListener('click', (e) => {
				const eventId = e.target.getAttribute('data-id');
				const event = allEvents.find(ev => ev.id === eventId);
				
				if (event) {
					// Преобразуем даты перед бронированием
					const eventWithDates = {
						...event,
						start: event.start instanceof Date ? event.start : new Date(event.start),
						end: event.end instanceof Date ? event.end : new Date(event.end)
					};
					prepareBookingForm(eventWithDates);
				} else {
					alert('Невозможно забронировать это мероприятие');
				}
			});
		});
	}

	// Функция для фильтрации мероприятий
	function filterAllEvents() {
	  // Получаем текущие значения фильтров
	  const status = document.getElementById('filterStatus').value;
	  const theme = document.getElementById('filterTheme').value;
	  const minAge = parseInt(document.getElementById('filterMinAge').value) || 3;
	  const maxAge = parseInt(document.getElementById('filterMaxAge').value) || 14;

	  // Фильтрация данных
	  const filtered = allEvents.filter(event => {
		const props = event.extendedProps || {};
		return (status === 'all' || props.status === status) &&
			   (theme === 'all' || props.theme === theme) &&
			   (props.minAge <= maxAge) &&
			   (props.maxAge >= minAge);
	  });

	  renderAllEventsTable(filtered);
	}

	// Функции для показа/скрытия подсказки
	function showEventTooltip(event, mouseEvent) {
		const tooltip = document.getElementById('eventTooltip');
		tooltipTitle.textContent = event.title;
		
		// Удаляем все классы статусов и типов стоимости
		tooltip.classList.remove('status-free', 'status-pending', 'status-booked', 'status-paid', 'status-gratis');
		
		let statusText = '';
		let statusClass = '';
		let textColorClass = '';
		
		// СНАЧАЛА проверяем статус бронирования (это главный приоритет)
		switch(event.extendedProps.status) {
			case 'free':
				statusText = 'Вы можете забронировать это мероприятие';
				statusClass = 'status-free';
				textColorClass = 'text-free';
				break;
			case 'pending':
				statusText = 'Ожидает подтверждения';
				statusClass = 'status-pending';
				textColorClass = 'text-pending';
				break;
			case 'booked':
				statusText = 'Мероприятие забронировано';
				statusClass = 'status-booked';
				textColorClass = 'text-booked'; // ВЫСШИЙ ПРИОРИТЕТ
				break;
		}
		
		// ПОТОМ проверяем тип стоимости (меняем цвет только для свободных мероприятий)
		const priceType = event.extendedProps.priceType || 'gratis';
		
		// Меняем цвет на синий/зеленый ТОЛЬКО если мероприятие свободно
		if (event.extendedProps.status === 'free') {
			if (priceType === 'paid') {
				tooltip.classList.add('status-paid');
				textColorClass = 'text-paid'; // Синий для платных свободных
				if (event.extendedProps.price) {
					statusText += ` (Платно)`;
				}
			} else {
				tooltip.classList.add('status-gratis');
				textColorClass = 'text-gratis'; // Зеленый для бесплатных свободных
				statusText += ' (Бесплатно)';
			}
		} else {
			// Для забронированных/ожидающих оставляем оригинальные цвета статуса
			if (priceType === 'paid' && event.extendedProps.price) {
				statusText += ` (Платно)`;
			} else if (priceType === 'gratis') {
				statusText += ' (Бесплатно)';
			}
		}
		
		// Добавляем классы
		tooltip.classList.add(statusClass);
		
		// Получаем первую картинку мероприятия
		const firstImage = event.extendedProps.images && event.extendedProps.images.length > 0 
			? event.extendedProps.images[0] 
			: null;
					
		tooltipDescription.innerHTML = `
			<img src="${firstImage}" 
				 class="event-tooltip-image" 
				 alt="${event.title}" 
				 style="max-width: 250px; max-height: 150px; object-fit: contain;">
			<div class="status-text ${textColorClass}">
				${statusText}
			</div>
		`;
		
		tooltip.style.display = 'block';
		updateTooltipPosition(mouseEvent);
	}

	function hideEventTooltip() {
		tooltip.style.display = 'none';
	}

	function updateTooltipPosition(mouseEvent) {
		const x = mouseEvent.pageX + 10;
		const y = mouseEvent.pageY + 10;
		
		tooltip.style.left = `${x}px`;
		tooltip.style.top = `${y}px`;
	}

	// обработчик движения мыши для обновления позиции
	document.addEventListener('mousemove', function(e) {
		if (tooltip.style.display === 'block') {
			updateTooltipPosition(e);
		}
	});

    // Загрузка мероприятий с сервера
    function loadEvents(start, end, successCallback) {
        const minAge = document.getElementById('minAgeFilter').value;
		const maxAge = document.getElementById('maxAgeFilter').value;
        const durationFilter = document.getElementById('durationFilter').value;
        const themeFilter = document.getElementById('themeFilter').value;
		const priceFilter = document.getElementById('priceFilter').value;
	
        axios.get('/api/events', {
            params: {
                start: start.toISOString(),
                end: end.toISOString(),
                minAge: minAge,
				maxAge: maxAge,
                duration: durationFilter !== 'all' ? durationFilter : undefined,
                theme: themeFilter !== 'all' ? themeFilter : undefined,
				priceType: priceFilter !== 'all' ? priceFilter : undefined
            }
        }).then(response => {
            successCallback(response.data);
        }).catch(error => {
            console.error('Error loading events:', error);
            failureCallback(error);
        });
    }
	
	// функция для создания конфига запросов
	function getAuthConfig() {
		return {
			headers: {
				'Authorization': `Bearer ${adminToken}`
			}
		};
	}
	
    // Показать информацию о мероприятии
    function showEventInfo(event) {
		// Проверка модального окна
		const infoModal = document.getElementById('eventInfoModal');
		if (!infoModal) {
			alert('Системная ошибка: не найдено окно информации');
			return;
		}

		// Проверка события
		if (!event) {
			document.getElementById('infoEventTitle').textContent = 'Мероприятие не найдено';
			const modal = new bootstrap.Modal(infoModal);
			modal.show();
			return;
		}

		// Проверяем extendedProps
		if (!event.extendedProps) {
			event.extendedProps = {
				description: 'Описание отсутствует',
				duration: 0,
				age: 'Не указан',
				theme: 'Не указана',
				images: [],
				imagesDescription: '',
				status: 'free'
			};
		}
		document.getElementById('infoEventTitle').textContent = event.title || 'Без названия';
		document.getElementById('infoEventTime').textContent = formatEventTime(event.start, event.end);
		document.getElementById('infoEventminAge').textContent = event.extendedProps.minAge;
		document.getElementById('infoEventmaxAge').textContent = event.extendedProps.maxAge;
		document.getElementById('infoEventDuration').textContent = event.extendedProps.duration + ' мин';
		document.getElementById('infoEventTheme').textContent = getThemeName(event.extendedProps.theme);
		document.getElementById('infoEventDescription').textContent = event.extendedProps.description;
		
		const priceElement = document.getElementById('infoEventPrice');
		if (priceElement) {
			if (event.extendedProps.priceType === 'paid' && event.extendedProps.price) {
				priceElement.textContent = 'Платно';
			} else {
				priceElement.textContent = 'Бесплатно';
			}
		}
		
		// Очистка и добавление изображений
		const imagesContainer = document.getElementById('infoEventImages');
		imagesContainer.innerHTML = '';
		if (event.extendedProps.images && event.extendedProps.images.length > 0) {
			event.extendedProps.images.forEach(imageUrl => {
				if (imageUrl.trim()) {
					const img = document.createElement('img');
					img.src = imageUrl.trim();
					img.alt = event.title;
					img.className = 'img-fluid mb-2';
					imagesContainer.appendChild(img);
				}
			});
		}

		// Получаем описание изображений (новый улучшенный вариант)
		const imagesDescription = 
			(event.extendedProps?.imagesDescription && String(event.extendedProps.imagesDescription)) || 
			(event.imagesDescription && String(event.imagesDescription)) || 
			'';

		// Отображаем описание (с проверкой элемента)
		const descElement = document.getElementById('infoEventImagesDescription');
		if (descElement) {
			// Гарантируем, что работаем со строкой
			descElement.textContent = typeof imagesDescription === 'string' ? imagesDescription : '';
			// Показываем/скрываем блок
			descElement.style.display = imagesDescription && imagesDescription.trim().length > 0 ? 'block' : 'none';
		}
		
		// Настройка кнопки бронирования
		const bookBtn = document.getElementById('bookEventBtn');
		bookBtn.style.display = event.extendedProps.status === 'free' ? 'block' : 'none';
		bookBtn.onclick = function() {
			// Используем Bootstrap JS для скрытия модального окна
			const modal = bootstrap.Modal.getInstance(document.getElementById('eventInfoModal'));
			modal.hide();
			prepareBookingForm(event);
		};
		
		// Показываем модальное окно с использованием Bootstrap JS
		const modal = new bootstrap.Modal(document.getElementById('eventInfoModal'));
		modal.show();
	}

    // Подготовка формы бронирования
    function prepareBookingForm(event) {
		// Проверяем, что event существует
		if (!event) {
			console.error('мероприятие не обнаружено в  prepareBookingForm');
			alert('Ошибка: мероприятие не найдено');
			return;
		}

		// Преобразуем даты, если нужно
		const start = event.start instanceof Date ? event.start : new Date(event.start);
		const end = event.end instanceof Date ? event.end : new Date(event.end);

		// Проверяем валидность дат
		if (isNaN(start.getTime()) || isNaN(end.getTime())) {
			console.error('Invalid date in event:', event);
			alert('Ошибка в данных мероприятия');
			return;
		}
		
		// ПРОВЕРКА: Если мероприятие уже прошло и пользователь не админ
		const now = new Date();
		if (start < now && !adminToken) {
			alert('❌ Это мероприятие уже прошло. Бронирование недоступно.\n\nЕсли вам нужно забронировать прошедшее мероприятие, обратитесь к администратору.');
			return;
		}

		// Заполняем форму
		document.getElementById('eventId').value = event.id;
		document.getElementById('eventTitle').value = event.title || 'Без названия';
		document.getElementById('eventTime').value = formatEventTime(start, end);
		
		// Показываем модальное окно
		const modal = new bootstrap.Modal(document.getElementById('bookingModal'));
		modal.show();
	}

    // Отправка формы бронирования
    document.getElementById('submitBooking').addEventListener('click', async function() {
		const form = document.getElementById('bookingForm');
		if (!form.checkValidity()) {
			form.classList.add('was-validated');
			return;
		}
		
		await bookEvent(document.getElementById('eventId').value);
		
		// Закрываем модальное окно
		const modal = bootstrap.Modal.getInstance(document.getElementById('bookingModal'));
		modal.hide();
	});

    // Форматирование времени мероприятия
	function formatEventTime(start, end) {
		const startDate = start instanceof Date ? start : new Date(start);
		const endDate = end instanceof Date ? end : new Date(end);
		
		if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
			console.error('Invalid date format:', { start, end });
			return 'Дата не указана';
		}
		
		try {
			//Ручное форматирование чтобы избежать влияния часовых поясов
			const formatTime = (date) => {
				return date.toLocaleTimeString('ru-RU', {
					hour: '2-digit',
					minute: '2-digit'
				});
			};
			
			return `${startDate.toLocaleDateString('ru-RU')} ${formatTime(startDate)} - ${formatTime(endDate)}`;
		} catch (error) {
			console.error('Date formatting error:', error);
			return 'Ошибка формата даты';
		}
	}

    // Получение названия тематики
    function getThemeName(theme) {
        const themes = {
            'literature': 'Художественная литература',
            'science': 'Естествознание',
            'art': 'Искусство',
            'history': 'Науки о людях и обществе',
            'children': 'Детские'
        };
        return themes[theme] || theme;
    }

    // Админ-функционал
    document.getElementById('adminLogin').addEventListener('click', async function() {
	  try {
		const password = prompt('Введите пароль администратора:');
		if (!password) return;
		
		const response = await axios.post('/api/admin/login', { password });
		console.log('Login response:', response.data);
		
		if (response.data.success && response.data.token) {
		  adminToken = response.data.token;
		  localStorage.setItem('adminToken', adminToken);
		  
		  // Показываем панель
		  document.getElementById('adminPanel').classList.remove('d-none');
		  
		  // Загружаем данные
		  await loadAdminData();
		  
		  // Меняем кнопку входа на кнопку выхода
		  this.textContent = 'Выйти';
		  this.onclick = adminLogout;
		  toggleAdminFields(true);
		} else {
		  alert('Ошибка: ' + (response.data.message || 'Неизвестная ошибка'));
		}
	  } catch (error) {
		console.error('Login failed:', error);
		alert('Ошибка входа: ' + (error.response?.data?.message || error.message));
	  }
	});

	function adminLogout() {
		adminToken = null;
		toggleAdminFields(false);
		localStorage.removeItem('adminToken');
		document.getElementById('adminPanel').classList.add('d-none');
		document.getElementById('adminLogin').textContent = 'Вход для администратора';
		document.getElementById('adminLogin').onclick = function() {
			location.reload(); // Перезагружаем страницу для чистого состояния
		};
	}

    // Загрузка данных для админ-панели
	async function loadAdminData() {
		try {
			console.log('Loading admin data with token:', adminToken);
			
			const [eventsRes, bookingsRes] = await Promise.all([
				axios.get('/api/admin/events', getAuthConfig()),
				axios.get('/api/admin/bookings', getAuthConfig())
			]);

			allAdminEvents = eventsRes.data;
			allAdminBookings = bookingsRes.data;
			
			fillResponsibleFilter(allAdminEvents);
			
			// применяем фильтры
			applyAdminFilters();

		} catch (error) {
			console.error('Admin data load error:', error);
		}
	}
	
	window.renderBookingsTable = function(bookings) {
		const tableBody = document.getElementById('bookingsTableBody');
		if (!tableBody) return;

		const now = new Date();
		
		// Фильтруем только будущие бронирования
		const futureBookings = bookings.filter(booking => {
			// Находим связанное мероприятие
			const relatedEvent = allAdminEvents.find(event => event.id === booking.eventId);
			if (!relatedEvent) return false;
			
			// Проверяем, что мероприятие еще не прошло
			const eventDate = new Date(relatedEvent.start);
			return eventDate >= now; // Только будущие мероприятия
		});

		// Сортируем по дате создания (новые сверху)
		const sortedBookings = futureBookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

		tableBody.innerHTML = sortedBookings.map(booking => {
			// Находим связанное мероприятие
			const relatedEvent = allAdminEvents.find(event => event.id === booking.eventId);
			
			// Форматируем дату из мероприятия
			const eventDate = relatedEvent ? new Date(relatedEvent.start) : new Date(booking.eventDate);
			
			return `
				<tr>
					<td>
						<a href="#" class="booking-link" data-id="${booking.id}">
							${relatedEvent ? relatedEvent.title : booking.eventTitle}
						</a>
					</td>
					<td>${eventDate.toLocaleString('ru-RU', {
						day: '2-digit',
						month: '2-digit', 
						year: 'numeric',
						hour: '2-digit',
						minute: '2-digit'
					})}</td>
					<td>${booking.userName}</td>
					<td>${booking.phone}</td>
					<td>${booking.participantsCount}</td>
					<td>
						<span class="badge ${booking.status === 'confirmed' ? 'bg-success' : 'bg-warning'}">
							${booking.status === 'confirmed' ? 'Подтверждено' : 'Ожидание'}
						</span>
					</td>
					<td>
						${booking.status === 'pending' ? 
							`<button class="btn btn-sm btn-warning me-1" onclick="approveBooking('${booking.id}')">
								Подтвердить
							</button>` : ''}
						<button class="btn btn-sm btn-danger" onclick="deleteBooking('${booking.id}')">
							<i class="bi bi-trash"></i>
						</button>
					</td>
					<td>${booking.comments || ''}</td>
				</tr>
			`;
		}).join('');

		// Добавляем обработчики для ссылок
		document.querySelectorAll('.booking-link').forEach(link => {
			link.addEventListener('click', async (e) => {
				e.preventDefault();
				const bookingId = e.target.getAttribute('data-id');
				await showBookingInfo(bookingId);
			});
		});
		
		// Если нет будущих бронирований, показываем сообщение
		if (futureBookings.length === 0) {
			tableBody.innerHTML = `
				<tr>
					<td colspan="8" class="text-center text-muted py-4">
						Нет активных бронирований
					</td>
				</tr>
			`;
		}
	};
	

	// Функция для отображения архивных мероприятий
	function renderArchiveEventsTable(archiveEvents, bookings) {
		const tableBody = document.getElementById('archiveEventsTableBody');
		if (!tableBody) {
			console.error('Table body for archive events not found');
			return;
		}

		// Сортируем архивные мероприятия по дате (от новых к старым)
		const sortedArchiveEvents = archiveEvents.sort((a, b) => new Date(b.start) - new Date(a.start));

		tableBody.innerHTML = sortedArchiveEvents.map(event => {
			const isVisible = event.visible !== false;			
			const getPriceDisplay = (priceType, price) => {
			  if (priceType === 'paid' && price) {
				return `<span class="price-badge price-paid">${price} руб.</span>`;
			  }
			  return `<span class="price-badge price-free">${getPriceTypeName(event.priceType)}</span>`;
			};
		
			return `
				<tr>
					<td>
						<a href="#" class="event-admin-link" data-id="${event.id}">
							${event.title}
							${!isVisible ? '<span class="badge bg-secondary ms-1">Скрыто</span>' : ''}
						</a>
					</td>
					<td>${new Date(event.start).toLocaleString('ru-RU', 
						{
							day: '2-digit',
							month: '2-digit',
							year: 'numeric',
							hour: '2-digit',
							minute: '2-digit'
						}
					)}
				</td>
					<td>${event.responsible || 'Не назначен'}</td>
					<td>
						<span class="badge ${event.status === 'free' ? 'bg-success' : 'bg-warning'}">
							${getStatusName(event.status)}
						</span>
					</td>
					<td>${getPriceDisplay(event.priceType, event.price)}</td>
					<td>
						<button class="btn btn-sm btn-warning me-1" onclick="confirmEditEvent('${event.id}')" title="Изменить мероприятие">
							<i class="bi bi-pencil"></i> 
						</button>
						<button class="btn btn-outline-secondary me-1" onclick="copyEvent('${event.id}')" title="Добавить такое же мероприятие">
							<i class="bi bi-files"></i> 
						</button>
						<button class="btn btn-sm btn-danger" onclick="deleteEvent('${event.id}')" title="Удалить мероприятие">
							<i class="bi bi-trash"></i>
						</button>
						<button class="btn btn-sm ${isVisible ? 'btn-outline-success' : 'btn-outline-secondary'} me-1" 
								onclick="toggleEventVisibility('${event.id}', ${isVisible})"
								data-bs-toggle="tooltip" 
								data-bs-placement="top" 
								title="${isVisible ? 'Скрыть мероприятие' : 'Показать мероприятие'}">
							<i class="bi ${isVisible ? 'bi-eye' : 'bi-eye-slash'}"></i>
						</button>
					</td>
				</tr>
			`;
		}).join('');
		addAdminEventLinkHandlers(sortedArchiveEvents);
	}

	// Функция применения фильтров в админке
	window.applyAdminFilters = function() {
		const titleFilter = document.getElementById('adminTitleFilter')?.value.toLowerCase() || '';
		const dateFrom = document.getElementById('adminDateFrom')?.value;
		const dateTo = document.getElementById('adminDateTo')?.value;
		const responsibleFilter = document.getElementById('adminResponsibleFilter')?.value || '';
		const statusFilter = document.getElementById('adminStatusFilter')?.value || '';
		const priceFilter = document.getElementById('adminPriceTypeFilter')?.value || '';
		const visibilityFilter = document.getElementById('adminVisibilityFilter')?.value || '';
		
		// Простая логика: всегда фильтруем обе вкладки
		const filteredEvents = allAdminEvents.filter(event => {
			const matchesTitle = !titleFilter || event.title.toLowerCase().includes(titleFilter);
			const matchesDateFrom = !dateFrom || new Date(event.start) >= new Date(dateFrom);
			const matchesDateTo = !dateTo || new Date(event.start) <= new Date(dateTo + 'T23:59:59');
			const matchesResponsible = !responsibleFilter || event.responsible === responsibleFilter;
			const matchesStatus = !statusFilter || 
				(statusFilter === 'confirmed' ? 
					event.status === 'booked' // для мероприятий
					: event.status === statusFilter); // для других статусов
			const matchesPrice = !priceFilter || event.priceType === priceFilter;
			const matchesVisibility = !visibilityFilter || 
				(visibilityFilter === 'visible' && event.visible !== false) ||
				(visibilityFilter === 'hidden' && event.visible === false);
			
			return matchesTitle && matchesDateFrom && matchesDateTo && matchesResponsible && matchesStatus && matchesPrice && matchesVisibility;
		});

		const filteredBookings = allAdminBookings.filter(booking => {
			// Находим связанное мероприятие для фильтрации по стоимости и ответственному
			const relatedEvent = allAdminEvents.find(event => event.id === booking.eventId);
			
			const matchesEventTitle = !titleFilter || (booking.eventTitle && booking.eventTitle.toLowerCase().includes(titleFilter));
			const matchesDateFrom = !dateFrom || new Date(booking.eventDate) >= new Date(dateFrom);
			const matchesDateTo = !dateTo || new Date(booking.eventDate) <= new Date(dateTo + 'T23:59:59');
			const matchesStatus = !statusFilter || 
				(statusFilter === 'booked' ? 
					booking.status === 'confirmed' // для бронирований 'booked' соответствует 'confirmed'
					: booking.status === statusFilter); // для других статусов
			const matchesResponsible = !responsibleFilter || (relatedEvent && relatedEvent.responsible === responsibleFilter);
			const matchesPrice = !priceFilter || (relatedEvent && relatedEvent.priceType === priceFilter);

			return matchesEventTitle && matchesDateFrom && matchesDateTo && matchesStatus && matchesResponsible && matchesPrice;
		});

		// Всегда обновляем обе таблицы
		renderFilteredEvents(filteredEvents);
		renderBookingsTable(filteredBookings);
		renderArchiveBookingsTable(filteredBookings);
	};

	window.renderActiveEventsTable = function(events) {
		// Используем правильный ID из HTML
		const tableBody = document.getElementById('eventsTableBody');
		if (!tableBody) {
			console.error('Active events table body not found');
			return;
		}

		// Сортируем по дате (от новых к старым)
		const sortedEvents = events.sort((a, b) => new Date(b.start) - new Date(a.start));

		tableBody.innerHTML = sortedEvents.map(event => {
			const isVisible = event.visible !== false;
			const getPriceDisplay = (priceType, price) => {
				if (priceType === 'paid' && price) {
					return `<span class="price-badge price-paid">${price} руб.</span>`;
				}
				return `<span class="price-badge price-free">${getPriceTypeName(event.priceType)}</span>`;
			};
			
			return `
				<tr>
					<td>
						<a href="#" class="event-admin-link" data-id="${event.id}">
							${event.title}
							${!isVisible ? '<span class="badge bg-secondary ms-1">Скрыто</span>' : ''}
						</a>
					</td>
					<td>${new Date(event.start).toLocaleString('ru-RU', 
							{
								day: '2-digit',
								month: '2-digit',
								year: 'numeric',
								hour: '2-digit',
								minute: '2-digit'
							}
						)}
					</td>
					<td>${event.responsible || 'Не назначен'}</td>
					<td>
						<span class="badge ${event.status === 'free' ? 'bg-success' : 'bg-warning'}">
							${getStatusName(event.status)}
						</span>
					</td>
					<td>${getPriceDisplay(event.priceType, event.price)}</td>
					<td>
						<button class="btn btn-sm btn-warning me-1" onclick="confirmEditEvent('${event.id}')" title="Изменить мероприятие">
							<i class="bi bi-pencil"></i> 
						</button>
						<button class="btn btn-outline-secondary me-1" onclick="copyEvent('${event.id}')" title="Добавить такое же мероприятие">
							<i class="bi bi-files"></i> 
						</button>
						<button class="btn btn-sm btn-danger" onclick="deleteEvent('${event.id}')" title="Удалить мероприятие">
							<i class="bi bi-trash"></i>
						</button>
						<button class="btn btn-sm ${isVisible ? 'btn-outline-success' : 'btn-outline-secondary'} me-1" 
								onclick="toggleEventVisibility('${event.id}', ${isVisible})"
								data-bs-toggle="tooltip" 
								data-bs-placement="top" 
								title="${isVisible ? 'Скрыть мероприятие' : 'Показать мероприятие'}">
							<i class="bi ${isVisible ? 'bi-eye' : 'bi-eye-slash'}"></i>
						</button>
					</td>
				</tr>
			`;
		}).join('');
		addAdminEventLinkHandlers(sortedEvents);
	};

	// Функция для копирования мероприятия
	window.copyEvent = async function(eventId) {
		try {
			console.log('Copying event:', eventId);
			
			// Загружаем данные мероприятия
			const response = await makeAuthRequest({
				method: 'get',
				url: `/api/events/${eventId}`
			});
			
			const originalEvent = response.data;
			
			// Сохраняем картинки в глобальную переменную
			copiedImages = originalEvent.images || [];
			console.log('Copied images to variable:', copiedImages);
			
			// Создаем копию без даты и времени
			const eventCopy = {
				title: `${originalEvent.title}`,
				description: originalEvent.description,
				// Дата и время НЕ копируются - оставляем пустыми
				date: '',
				time: '',
				duration: originalEvent.duration,
				minAge: originalEvent.minAge,
				maxAge: originalEvent.maxAge,
				theme: originalEvent.theme,
				priceType: originalEvent.priceType,
				price: originalEvent.price,
				responsible: originalEvent.responsible,
				imagesDescription: originalEvent.imagesDescription
			};
			
			// Заполняем форму добавления данными копии
			fillAddEventForm(eventCopy);
			
			// Показываем превью скопированных картинок
			displayCopiedImagesPreview();
			
			// Переключаемся на вкладку "Добавить"
			const addEventTab = document.querySelector('button[data-bs-target="#addEvent"]');
			if (addEventTab) {
				addEventTab.click();
			}
			
			// Прокручиваем к форме добавления
			document.getElementById('addEvent').scrollIntoView({ behavior: 'smooth' });
			
		} catch (error) {
			console.error('Error copying event:', error);
			alert('Ошибка при копировании мероприятия: ' + (error.response?.data?.message || error.message));
		}
	};

	// Функция для заполнения формы добавления данными
	function fillAddEventForm(eventData) {
		// Заполняем текстовые поля
		document.getElementById('newEventTitle').value = eventData.title || '';
		document.getElementById('newEventDescription').value = eventData.description || '';
		document.getElementById('newEventDuration').value = eventData.duration || 60;
		document.getElementById('newEventMinAge').value = eventData.minAge || 3;
		document.getElementById('newEventMaxAge').value = eventData.maxAge || 14;
		document.getElementById('newEventTheme').value = eventData.theme || 'literature';
		document.getElementById('newEventImagesDescription').value = eventData.imagesDescription || '';
		
		// Заполняем тип стоимости
		const priceTypeElement = document.getElementById('newEventPriceType');
		if (priceTypeElement) {
			priceTypeElement.value = eventData.priceType || 'gratis';
						
			// Заполняем цену если мероприятие платное
			if (eventData.priceType === 'paid' && eventData.price) {
				const priceElement = document.getElementById('newEventPrice');
				if (priceElement) {
					priceElement.value = eventData.price;
				}
			}
		}
		
		// Заполняем ответственного
		const responsibleElement = document.getElementById('eventResponsible');
		if (responsibleElement) {
			responsibleElement.value = eventData.responsible || '';
		}
		
		// Сохраняем данные о картинках в глобальную переменную
		window.copiedImages = eventData.images || [];
		
		// Отображаем превью
		displayCopiedImagesPreview(window.copiedImages);
		showCopiedImagesMessage();
		// Показываем уведомление
		showNotification('Данные мероприятия скопированы в форму. Заполните дату и время.', 'info');
	}
	
	// Функция для показа сообщения о скопированных изображениях
	function showCopiedImagesMessage() {
		const imagesContainer = document.getElementById('newEventImages').parentNode;
		
		// Удаляем старое сообщение если есть
		const oldMessage = document.getElementById('copiedImagesMessage');
		if (oldMessage) {
			oldMessage.remove();
		}
		
		if (copiedImages.length > 0) {
			// Создаем сообщение о скопированных изображениях
			const message = document.createElement('div');
			message.id = 'copiedImagesMessage';
			message.className = 'alert alert-info mt-2';
			message.innerHTML = `
				<i class="bi bi-images"></i> 
				<strong>Скопировано ${copiedImages.length} изображений</strong>
				<br>
				<small>Изображения будут автоматически добавлены к новому мероприятию</small>
			`;
			
			// Вставляем сообщение после поля загрузки файлов
			imagesContainer.appendChild(message);
		}
	}

	// Функция для отображения превью скопированных картинок
	function displayCopiedImagesPreview() {
		const previewContainer = document.getElementById('imagePreviews');
		if (!previewContainer) return;
		
		previewContainer.innerHTML = '';
		
		if (copiedImages && copiedImages.length > 0) {
			// Создаем превью для каждой картинки
			copiedImages.forEach((imageUrl, index) => {
				if (imageUrl && imageUrl.trim()) {
					const preview = document.createElement('div');
					preview.className = 'position-relative me-2 mb-2';
					preview.innerHTML = `
						<img src="${imageUrl.trim()}" 
							 class="img-thumbnail" 
							 style="width: 100px; height: 100px; object-fit: cover;"
							 alt="Скопированное изображение ${index + 1}">
						<div class="position-absolute top-0 start-0 bg-info text-white px-1 small">
							Копия
						</div>
					`;
					previewContainer.appendChild(preview);
				}
			});
			
			// Показываем информацию о скопированных картинках
			const infoElement = document.createElement('div');
			infoElement.className = 'alert alert-success mt-2 small';
			infoElement.innerHTML = `
				<i class="bi bi-check-circle"></i> 
				<strong>Скопировано ${copiedImages.length} изображений</strong>
				<br>
				<small>Они будут автоматически добавлены к новому мероприятию</small>
			`;
			previewContainer.appendChild(infoElement);
			
		} else {
			previewContainer.innerHTML = '<div class="text-muted">Нет изображений для копирования</div>';
		}
		
		// Также показываем сообщение в основном поле
		showCopiedImagesMessage();
	}

	// Функция для показа уведомлений (можно добавить в utils)
	function showNotification(message, type = 'info') {
		// Создаем элемент уведомления
		const notification = document.createElement('div');
		notification.className = `alert alert-${type} alert-dismissible fade show`;
		notification.style.position = 'fixed';
		notification.style.top = '20px';
		notification.style.right = '20px';
		notification.style.zIndex = '1060';
		notification.style.minWidth = '300px';
		notification.innerHTML = `
			${message}
			<button type="button" class="btn-close" data-bs-dismiss="alert"></button>
		`;
		
		document.body.appendChild(notification);
		
		// Автоматически скрываем через 5 секунд
		setTimeout(() => {
			if (notification.parentNode) {
				notification.remove();
			}
		}, 5000);
	}

	window.renderArchiveBookingsTable = function(bookings) {
		const tableBody = document.getElementById('archiveBookingsTableBody');
		if (!tableBody) return;

		// Фильтруем архивные бронирования (все прошедшие)
		const now = new Date();
		const archiveBookings = bookings.filter(booking => {
			const relatedEvent = allAdminEvents.find(event => event.id === booking.eventId);
			const eventDate = relatedEvent ? new Date(relatedEvent.start) : new Date(booking.eventDate);
			return eventDate < now; // ВСЕ прошедшие мероприятия
		});

		if (archiveBookings.length === 0) {
			tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Архивные бронирования не найдены</td></tr>`;
			return;
		}

		// Сортируем по дате мероприятия (новые сверху)
		const sortedBookings = archiveBookings.sort((a, b) => {
			const eventA = allAdminEvents.find(event => event.id === a.eventId);
			const eventB = allAdminEvents.find(event => event.id === b.eventId);
			const dateA = eventA ? new Date(eventA.start) : new Date(a.eventDate);
			const dateB = eventB ? new Date(eventB.start) : new Date(b.eventDate);
			return dateB - dateA; // От новых к старым
		});

		tableBody.innerHTML = sortedBookings.map(booking => {
			const relatedEvent = allAdminEvents.find(event => event.id === booking.eventId);
			const eventDate = relatedEvent ? new Date(relatedEvent.start) : new Date(booking.eventDate);
			const responsible = relatedEvent?.responsible || 'Не назначен';

			return `
				<tr>
					<td>
						<a href="#" class="booking-link" data-id="${booking.id}">
							${relatedEvent ? relatedEvent.title : booking.eventTitle}
						</a>
					</td>
					<td>${eventDate.toLocaleString('ru-RU', {
						day: '2-digit',
						month: '2-digit',
						year: 'numeric',
						hour: '2-digit', 
						minute: '2-digit'
					})}</td>
					<td>${booking.userName || 'Не указано'}</td>
					<td>${booking.phone || 'Не указан'}</td>
					<td>${booking.participantsCount || 0}</td>
					<td>
						<span class="badge ${booking.status === 'confirmed' ? 'bg-success' : 'bg-warning'}">
							${booking.status === 'confirmed' ? 'Подтверждено' : 'Ожидание'}
						</span>
						<button class="btn btn-sm btn-danger" onclick="deleteBooking('${booking.id}')">
							<i class="bi bi-trash"></i>
						</button>
					</td>
					<td>${responsible}</td>
				</tr>
			`;
		}).join('');
		
		document.querySelectorAll('.booking-link').forEach(link => {
			link.addEventListener('click', async (e) => {
				e.preventDefault();
				const bookingId = e.target.getAttribute('data-id');
				await showBookingInfo(bookingId);
			});
		});
	};

	window.fillResponsibleFilter = function(events) {
		const responsibleSelect = document.getElementById('adminResponsibleFilter');
		if (!responsibleSelect) return;

		const responsibles = [...new Set(events.map(event => event.responsible).filter(Boolean))];
		
		responsibleSelect.innerHTML = '<option value="">Все</option>';
		responsibles.forEach(responsible => {
			const option = document.createElement('option');
			option.value = responsible;
			option.textContent = responsible;
			responsibleSelect.appendChild(option);
		});
	};

	window.renderFilteredEvents = function(events) {
		const now = new Date();
		const activeEvents = events.filter(event => new Date(event.end) > now);
		const archiveEvents = events.filter(event => new Date(event.end) <= now);

		renderActiveEventsTable(activeEvents);
		renderArchiveEventsTable(archiveEvents, allAdminBookings);
		
		// Обновляем счетчики
		document.getElementById('eventsCount').textContent = events.length;
		document.getElementById('activeCount').textContent = activeEvents.length;
		document.getElementById('archiveCount').textContent = archiveEvents.length;
	};

	window.getPriceTypeName = function(priceType) {
		const types = {
			'gratis': 'Бесплатно',
			'paid': 'Платно',
			'all': 'Все'
		};
		return types[priceType] || priceType;
	};


    // Обработчик для показа/скрытия поля цены
    document.getElementById('newEventPriceType').addEventListener('change', function() {
        const priceField = document.getElementById('newPriceField');
        priceField.style.display = this.value === 'paid' ? 'block' : 'none';
    });
    
	const editPriceTypeElement = document.getElementById('editEventPriceType');
	if (editPriceTypeElement) {
		editPriceTypeElement.addEventListener('change', function() {
			const priceField = document.getElementById('editPriceField');
			if (priceField) {
				priceField.style.display = this.value === 'paid' ? 'block' : 'none';
			}
		});
	}

	// Функция подтверждения редактирования
	window.confirmEditEvent = async function(eventId) {
		// Сохраняем ссылку на кнопку
		const button = document.querySelector(`button[onclick="confirmEditEvent('${eventId}')"]`);
		if (!button) return;

		// Сохраняем исходный HTML кнопки
		const originalButtonHTML = button.innerHTML;
		
		try {
			// Показываем индикатор загрузки
			button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';
			button.disabled = true;

			// Добавляем проверку авторизации
			if (!adminToken) {
				throw new Error('Требуется авторизация');
			}

			const response = await makeAuthRequest({
				method: 'get',
				url: `/api/events/${eventId}`,
				headers: {
					'Authorization': `Bearer ${adminToken}`
				}
			});
			
			// Восстанавливаем кнопку
			button.innerHTML = originalButtonHTML;
			button.disabled = false;

			const event = response.data;

			// Проверка статуса мероприятия
			if (event.status !== 'free') {
				const confirmed = confirm(
					`Мероприятие "${event.title}" уже забронировано!\n\n` +
					`Статус: ${getStatusName(event.status)}\n` +
					`Дата: ${new Date(event.start).toLocaleString('ru-RU')}\n\n` +
					`Вы точно хотите его редактировать?`
				);
				
				if (!confirmed) return;
			}

			loadEventForEdit(event);
			
		} catch (error) {
			console.error('Error confirming event edit:', error);
			let errorMessage = 'Ошибка загрузки мероприятия';
			
			if (error.response) {
				errorMessage += `: ${error.response.data?.message || error.response.statusText}`;
			} else {
				errorMessage += `: ${error.message}`;
			}
			
			alert(errorMessage);
			
			// Восстанавливаем кнопку в случае ошибки
			if (button) {
				button.innerHTML = originalButtonHTML;
				button.disabled = false;
			}
		}
	};
	
	function loadEventForEdit(event) {
		try {
			// Проверка существования всех элементов формы
			const formElements = {
				id: document.getElementById('editEventId'),
				title: document.getElementById('editEventTitle'),
				description: document.getElementById('editEventDescription'),
				date: document.getElementById('editEventDate'),
				time: document.getElementById('editEventTime'),
				duration: document.getElementById('editEventDuration'),
				minAge: document.getElementById('editEventMinAge'),
				maxAge: document.getElementById('editEventMaxAge'),
				theme: document.getElementById('editEventTheme')
			};
			document.getElementById('editEventVisible').checked = event.visible !== false;
			document.getElementById('editEventResponsible').value = event.responsible || '';
			document.getElementById('editEventImagesDescription').value = 
				event.imagesDescription || 
				event.extendedProps?.imagesDescription || 
				'';
				
			// Заполняем тип стоимости и цену
			const priceTypeElement = document.getElementById('editEventPriceType');
			const priceField = document.getElementById('editPriceField');
			const priceElement = document.getElementById('editEventPrice');
			
			if (priceTypeElement && priceField && priceElement) {
				priceTypeElement.value = event.priceType || 'gratis';
				if (event.priceType === 'paid') {
					priceField.style.display = 'block';
					priceElement.value = event.price || 500;
				} else {
					priceField.style.display = 'none';
				}
			}

			// Проверяем, все ли элементы найдены
			for (const [key, element] of Object.entries(formElements)) {
				if (!element) {
					throw new Error(`Не найден элемент формы: editEvent${key.charAt(0).toUpperCase() + key.slice(1)}`);
				}
			}

			// Заполняем форму
			formElements.id.value = event.id;
			formElements.title.value = event.title || '';
			formElements.description.value = event.description || '';
			
			const startDate = new Date(event.start);
			if (isNaN(startDate.getTime())) throw new Error('Некорректная дата мероприятия');
			
			const localDate = new Date(startDate.getTime() + (startDate.getTimezoneOffset() * 60000));
			
			formElements.date.value = startDate.toISOString().split('T')[0];
			formElements.time.value = 
				startDate.getHours().toString().padStart(2, '0') + ':' + 
				startDate.getMinutes().toString().padStart(2, '0');
			
			formElements.duration.value = event.duration || 60;
			formElements.minAge.value = event.minAge || 0;
			formElements.maxAge.value = event.maxAge || 14;
			formElements.theme.value = event.theme || 'literature';
			
			// Блокируем дату/время для занятых мероприятий
			if (event.status !== 'free') {
				alert('Внимание! Мероприятие забронировано. Сообщите об изменениях гостю мероприятия!');
			}

			// Показываем модальное окно
			const modalElement = document.getElementById('editEventModal');
			if (!modalElement) throw new Error('Не найдено модальное окно редактирования');
			
			const modal = new bootstrap.Modal(modalElement);
			modal.show();
			
			const imagesContainer = document.getElementById('currentImages');
			imagesContainer.innerHTML = '';
			
			if (event.images && event.images.length > 0) {
				event.images.forEach((imgUrl, index) => {
					const imgWrapper = document.createElement('div');
					imgWrapper.className = 'position-relative me-2 mb-2';
					imgWrapper.innerHTML = `
						<img src="${imgUrl}" class="img-thumbnail" style="width: 100px; height: 100px; object-fit: cover;">
						<button class="btn btn-sm btn-danger position-absolute top-0 end-0 p-0" 
								style="width: 20px; height: 20px; font-size: 10px;"
								type="button"
								onclick="removeExistingImage('${event.id}', '${imgUrl}', this, event)">
							×
						</button>
					`;
					imagesContainer.appendChild(imgWrapper);
				});
			} else {
				imagesContainer.innerHTML = '<div class="text-muted">Нет загруженных изображений</div>';
			}
			
			// Очищаем превью новых изображений
			document.getElementById('imagePreviews').innerHTML = '';
			document.getElementById('newEventImages').value = '';
			document.getElementById('eventResponsible').value = event.responsible || '';

		} catch (error) {
			console.error('Error loading event for edit:', error);
			alert('Ошибка загрузки формы редактирования: ' + error.message);
		}
	}
	
	window.removeExistingImage = async function(eventId, imageUrl, button) {
		if (!confirm('Удалить это изображение?')) return;
		
		try {
			const response = await makeAuthRequest({
				method: 'DELETE',
				url: `/api/events/${eventId}/images`,
				data: { imageUrl }
			});
			
			button.parentElement.remove();
		} catch (error) {
			console.error('Error removing image:', error);
			alert('Ошибка удаления изображения');
		}
	};

	document.getElementById('saveEditedEvent').addEventListener('click', async function() {
		const button = this;
		
		// Валидация обязательных полей
		if (!validateEventForm()) {
			return;
		}
		
		button.disabled = true;
		button.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Сохранение...';

		try {
			// Создаем FormData и заполняем данными
			const formData = new FormData();
			const eventId = document.getElementById('editEventId').value;
			
			// Проверяем существование обязательных элементов
			const requiredFields = [
				'editEventTitle', 'editEventDate', 'editEventTime', 
				'editEventDuration', 'editEventPriceType'
			];
			
			for (const fieldId of requiredFields) {
				const element = document.getElementById(fieldId);
				if (!element) {
					throw new Error(`Не найден обязательный элемент: ${fieldId}`);
				}
			}

			// Добавляем все необходимые поля
			formData.append('id', eventId);
			formData.append('title', document.getElementById('editEventTitle').value.trim());
			formData.append('description', document.getElementById('editEventDescription').value.trim());
			formData.append('date', document.getElementById('editEventDate').value);
			formData.append('time', document.getElementById('editEventTime').value);
			formData.append('duration', document.getElementById('editEventDuration').value);
			formData.append('minAge', document.getElementById('editEventMinAge').value || '3');
			formData.append('maxAge', document.getElementById('editEventMaxAge').value || '14');
			formData.append('theme', document.getElementById('editEventTheme').value);
			formData.append('responsible', document.getElementById('editEventResponsible').value || '');
			formData.append('imagesDescription', document.getElementById('editEventImagesDescription').value.trim());
			const isVisible = document.getElementById('editEventVisible').checked;
			formData.append('visible', isVisible.toString());
			
			// Добавляем тип стоимости и цену (без дублирования)
			const priceType = document.getElementById('editEventPriceType').value;
			formData.append('priceType', priceType);
			if (priceType === 'paid') {
				const priceElement = document.getElementById('editEventPrice');
				if (priceElement) {
					formData.append('price', priceElement.value || '500');
				}
			}

			// Добавляем файлы изображений
			const filesInput = document.getElementById('newEventImages');
			if (filesInput && filesInput.files) {
				const files = Array.from(filesInput.files);
				
				for (let file of files) {
					if (file.type.startsWith('image/')) {
						try {
							// ВЫЗОВ ФУНКЦИИ СЖАТИЯ
							const compressedFile = await compressImage(file, 500, 0.8);
							formData.append('images', compressedFile);
							console.log(`Изображение сжато: ${file.name} -> ${compressedFile.size} bytes`);
						} catch (error) {
							console.warn(`Не удалось сжать ${file.name}:`, error);
							formData.append('images', file);
						}
					} else {
						formData.append('images', file);
					}
				}
			}

			const response = await axios.put(
				`/api/events/${eventId}`,
				formData,
				{
					headers: {
						'Authorization': `Bearer ${adminToken}`,
						'Content-Type': 'multipart/form-data'
					}
				}
			);

			alert('Мероприятие успешно обновлено!');
			await loadAdminData();
			calendar.refetchEvents();
			
			const modal = bootstrap.Modal.getInstance(document.getElementById('editEventModal'));
			if (modal) {
				modal.hide();
			}
		} catch (error) {
			console.error('Error updating event:', error);
			let errorMessage = 'Ошибка при обновлении мероприятия';
			if (error.response?.data?.message) {
				errorMessage += ': ' + error.response.data.message;
			} else if (error.message) {
				errorMessage += ': ' + error.message;
			}
			alert(errorMessage);
		} finally {
			button.disabled = false;
			button.innerHTML = 'Сохранить изменения';
		}
	});

	// Функция валидации формы
	function validateEventForm() {
		const requiredFields = [
			{ id: 'editEventTitle', name: 'Название мероприятия' },
			{ id: 'editEventDate', name: 'Дата' },
			{ id: 'editEventTime', name: 'Время' },
			{ id: 'editEventDuration', name: 'Продолжительность' }
		];

		for (const field of requiredFields) {
			const element = document.getElementById(field.id);
			if (!element) {
				alert(`Пожалуйста, заполните поле: ${field.name}`);
				if (element) element.focus();
				return false;
			}
		}

		// Проверка даты (не в прошлом)
		const date = document.getElementById('editEventDate').value;
		const time = document.getElementById('editEventTime').value;
		const eventDateTime = new Date(`${date}T${time}`);
		
		if (eventDateTime < new Date()) {
			if (!confirm('Дата мероприятия в прошлом. Вы уверены, что хотите сохранить?')) {
				return false;
			}
		}

		return true;
	}
	
	// Функция для обработки кликов по названиям мероприятий в админке
	function addAdminEventLinkHandlers(events) {
		const links = document.querySelectorAll('.event-admin-link');
		
		links.forEach(link => {
			link.addEventListener('click', async (e) => {
				e.preventDefault();
				console.log('Event admin link clicked, ID:', e.target.getAttribute('data-id'));
				const eventId = e.target.getAttribute('data-id');
				await showAdminEventInfo(eventId, events);
			});
		});
	}

	// Для совместимости оставляем старые функции
	async function showBookingInfo(bookingId) {
		await showEventOrBookingInfo(bookingId, 'booking');
	}

	async function showAdminEventInfo(eventId, events) {
		// Если передан массив events, используем его, иначе загрузим с сервера
		if (events) {
			const event = events.find(ev => ev.id === eventId);
			if (event) {
				// Создаем временный объект для передачи в функцию
				await showEventOrBookingInfo(eventId, 'event');
				return;
			}
		}
	}

	// Универсальная функция для показа информации о мероприятии или бронировании
	async function showEventOrBookingInfo(id, type = 'booking') {
		let adminInfoHTML = '';
		try {
			const existingModals = document.querySelectorAll('.modal.show');
			existingModals.forEach(modal => {
				const bsModal = bootstrap.Modal.getInstance(modal);
				if (bsModal) {
					bsModal.hide();
				}
			});
			
			await new Promise(resolve => setTimeout(resolve, 300));
			
			let event, booking;

			if (type === 'booking') {
				// Загрузка данных бронирования и мероприятия
				const bookingResponse = await axios.get(`/api/bookings/${id}`);
				booking = bookingResponse.data;
				
				const eventResponse = await axios.get(`/api/events/${booking.eventId}`);
				event = eventResponse.data;
			} else if (type === 'event') {
				// Загрузка только данных мероприятия
				const eventResponse = await axios.get(`/api/events/${id}`);
				event = eventResponse.data;
				booking = null; // Нет данных о бронировании
			}

			if (!event) {
				alert('Мероприятие не найдено');
				return;
			}

			// Форматирование дат
			const formatDate = (dateString) => {
				if (!dateString) return 'Не указано';
				const date = new Date(dateString);
				return isNaN(date.getTime()) ? dateString : date.toLocaleString('ru-RU', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				});
			};

			const formatFullDate = (dateString) => {
				if (!dateString) return 'Не указано';
				const date = new Date(dateString);
				return isNaN(date.getTime()) ? dateString : date.toLocaleString('ru-RU');
			};
			
			if (type === 'booking') {
				// РЕЖИМ БРОНИРОВАНИЯ - используем bookingInfoModal
				document.getElementById('bookingEventTitle').textContent = event.title || 'Без названия';
				document.getElementById('bookingEventDescription').textContent = event.description || 'Описание отсутствует';
				document.getElementById('bookingEventDateTime').textContent = formatDate(event.start);
			    
				let duration1 = event.duration || (event.extendedProps && event.extendedProps.duration);
				let finalResponsible = event.responsible || (event.extendedProps && event.extendedProps.responsible);
				if (!finalResponsible || !duration1 && adminToken && allAdminEvents.length > 0) {
					const adminEvent = allAdminEvents.find(ev => ev.id === booking.eventId);
					if (adminEvent) {
						finalResponsible = adminEvent.responsible;
						duration1 = adminEvent.duration;
					}
				}
				document.getElementById('bookingEventDuration').textContent = duration1 ? `${duration1} минут` : 'Не указана';
				document.getElementById('bookingResponsible').textContent = finalResponsible || 'Не назначен';
				
				document.getElementById('bookingEventminAge').textContent = event.minAge || 'Не указана';
				document.getElementById('bookingEventmaxAge').textContent = event.maxAge || 'Не указана';
				document.getElementById('bookingEventTheme').textContent = getThemeName(event.theme) || 'Не указана';
				document.getElementById('participantsQuantity').textContent = booking.participantsCount || 'Не указано';
				
				// Отображение изображений мероприятия
				const imagesContainer = document.getElementById('bookingEventImages');
				imagesContainer.innerHTML = '';
				if (event.images && event.images.length > 0) {
					event.images.forEach(img => {
						if (img.trim()) {
							const imgElement = document.createElement('img');
							imgElement.src = img.trim();
							imgElement.alt = event.title;
							imgElement.style.maxHeight = '500px';
							imagesContainer.appendChild(imgElement);
						}
					});
				} else {
					imagesContainer.innerHTML = '<p class="text-muted">Изображения отсутствуют</p>';
				}
				const imagesDescElement = document.createElement('p');
				imagesDescElement.className = 'text-muted mt-2';
				imagesDescElement.textContent = event.imagesDescription || 'Описание изображений отсутствует';
				imagesContainer.appendChild(imagesDescElement);

				// Заполнение данных бронирования
				document.getElementById('bookingUserName').textContent = booking.userName || 'Не указано';
				document.getElementById('bookingOrganization').textContent = booking.organization || 'Не указано';
				document.getElementById('bookingParticipantsAge').textContent = booking.participantsAge || 'Не указано';
				document.getElementById('bookingPhone').textContent = booking.phone || 'Не указано';
				document.getElementById('bookingComments').textContent = booking.comments || 'Нет комментариев';
				document.getElementById('bookingStatus').textContent = 
					booking.status === 'confirmed' ? 'Подтверждено' : 'Ожидание';
				document.getElementById('bookingCreatedAt').textContent = formatDate(booking.createdAt);
				document.getElementById('bookingInfoModal').setAttribute('data-booking-id', id);
				document.getElementById('adminCommentsEdit').value = booking.adminComments || '';
				
				// Показываем кнопки для админа
				if (adminToken) {
					document.getElementById('bookFromInfoBtn').classList.remove('d-none');
					document.getElementById('saveAdminCommentsBtn').classList.remove('d-none');
					
					// Если статус "pending", показываем кнопку бронирования
					document.getElementById('bookFromInfoBtn').style.display = 
						booking.status === 'pending' ? 'block' : 'none';
				}

				// Показываем модальное окно бронирования
				const modalElement = document.getElementById('bookingInfoModal');
				const modal = new bootstrap.Modal(modalElement);
				
				modalElement.addEventListener('hidden.bs.modal', cleanupModal);
				modal.show();

			} else {
				// РЕЖИМ МЕРОПРИЯТИЯ - используем eventInfoModal
				document.getElementById('infoEventTitle').textContent = event.title || 'Без названия';
				document.getElementById('infoEventTime').textContent = formatFullDate(event.start);
				document.getElementById('infoEventminAge').textContent = event.minAge || 'Не указана';
				document.getElementById('infoEventmaxAge').textContent = event.maxAge || 'Не указана';
				document.getElementById('infoEventDuration').textContent = (event.duration || 60) + ' минут';
				document.getElementById('infoEventTheme').textContent = getThemeName(event.theme) || 'Не указана';
				document.getElementById('infoEventDescription').textContent = event.description || 'Описание отсутствует';
				
				// Стоимость
				const priceElement = document.getElementById('infoEventPrice');
				if (priceElement) {
					// Ищем полные данные в allAdminEvents
					const adminEvent = allAdminEvents.find(ev => ev.id === event.id);
					
					if (adminEvent) {
						// Используем данные из админского массива
						if (adminEvent.priceType === 'paid' && adminEvent.price) {
							priceElement.textContent = adminEvent.price + ' руб.';
						} else {
							priceElement.textContent = 'Бесплатно';
						}
					} else {
						// Если админских данных нет, используем данные из event или ставим по умолчанию
						priceElement.textContent = 'Не определено';
					}
				}

				// Изображения
				const imagesContainer = document.getElementById('infoEventImages');
				imagesContainer.innerHTML = '';
				if (event.images && event.images.length > 0) {
					event.images.forEach(img => {
						if (img.trim()) {
							const imgElement = document.createElement('img');
							imgElement.src = img.trim();
							imgElement.alt = event.title;
							imgElement.className = 'img-fluid mb-2 me-2';
							imgElement.style.maxHeight = '150px';
							imagesContainer.appendChild(imgElement);
						}
					});
				}

				// Описание изображений
				const imagesDescElement = document.getElementById('infoEventImagesDescription');
				if (imagesDescElement) {
					imagesDescElement.textContent = event.imagesDescription || '';
					imagesDescElement.style.display = event.imagesDescription ? 'block' : 'none';
				}

				const adminEvent = allAdminEvents.find(ev => ev.id === event.id);

				if (adminEvent && adminToken) {
					// Берем данные из админского массива, где есть все поля
					const eventVisible = adminEvent.visible !== false;
					const eventResponsible = adminEvent.responsible;
					const eventLastModified = adminEvent.lastModified;
					
					adminInfoHTML = `
						<div class="admin-event-info mt-3 p-3 border rounded bg-light">
							<h6 class="mb-2 text-primary">Административная информация:</h6>
							<p class="mb-1"><strong>Статус:</strong> 
								<span class="badge ${adminEvent.status === 'free' ? 'bg-success' : 'bg-warning'}">
									${getStatusName(adminEvent.status)}
								</span>
							</p>
							<p class="mb-1"><strong>Видимость:</strong> 
								<span class="badge ${eventVisible ? 'bg-success' : 'bg-secondary'}">
									${eventVisible ? 'Видимо' : 'Скрыто'}
								</span>
							</p>
							<p class="mb-1"><strong>Ответственный:</strong> ${eventResponsible || 'Не назначен'}</p>
							${eventLastModified ? `<p class="mb-0"><strong>Последнее изменение:</strong> ${formatFullDate(eventLastModified)}</p>` : ''}
						</div>
					`;
				} else {
					// Если админские данные не найдены или пользователь не админ
					adminInfoHTML = `
						<div class="admin-event-info mt-3 p-3 border rounded bg-light">
							<h6 class="mb-2 text-primary">Административная информация:</h6>
							<p class="mb-1"><strong>Статус:</strong> 
								<span class="badge ${event.status === 'free' ? 'bg-success' : 'bg-warning'}">
									${getStatusName(event.status)}
								</span>
							</p>
							<p class="mb-1 text-muted"><small>Для просмотра полной информации требуется авторизация</small></p>
						</div>
					`;
				}
				
				const descriptionElement = document.getElementById('infoEventDescription');
				descriptionElement.insertAdjacentHTML('afterend', adminInfoHTML);

				// НАСТРОЙКА КНОПОК ДЛЯ АДМИНКИ
				const bookBtn = document.getElementById('bookEventBtn');
				const closeBtn = document.querySelector('#eventInfoModal .btn-outline-primary');
				
				// Скрываем кнопку бронирования для админки
				if (bookBtn) {
					bookBtn.style.display = 'none';
				}
				
				// Добавляем кнопку редактирования
				if (closeBtn) {
					const editBtn = document.createElement('button');
					editBtn.type = 'button';
					editBtn.className = 'btn btn-warning me-2';
					editBtn.innerHTML = '<i class="bi bi-pencil"></i> Редактировать';
					editBtn.onclick = function() {
						const modal = bootstrap.Modal.getInstance(document.getElementById('eventInfoModal'));
						if (modal) {
							modal.hide();
						}
						setTimeout(() => {
							confirmEditEvent(id);
						}, 300);
					};
					
					closeBtn.parentNode.insertBefore(editBtn, closeBtn);
				}

				// Показываем модальное окно мероприятия
				const modalElement = document.getElementById('eventInfoModal');
				const modal = new bootstrap.Modal(modalElement);
				
				modalElement.addEventListener('hidden.bs.modal', cleanupModal);
				modal.show();
			}

		} catch (error) {
			console.error('Error loading info:', error);
			alert('Ошибка загрузки информации: ' + (error.response?.data?.message || error.message));
		}
	}

	// Функция очистки модальных окон
	function cleanupModal() {
		// Удаляем админскую информацию если есть
		const adminInfo = document.querySelector('.admin-event-info');
		if (adminInfo) {
			adminInfo.remove();
		}
		
		// Удаляем кнопку редактирования если есть
		const editBtn = document.querySelector('#eventInfoModal .btn-warning');
		if (editBtn) {
			editBtn.remove();
		}
		
		// Восстанавливаем кнопку бронирования
		const bookBtn = document.getElementById('bookEventBtn');
		if (bookBtn) {
			bookBtn.style.display = 'block';
		}
		
		// Удаляем backdrop
		const backdrops = document.querySelectorAll('.modal-backdrop');
		backdrops.forEach(backdrop => backdrop.remove());
		
		// Восстанавливаем прокрутку
		document.body.classList.remove('modal-open');
		document.body.style.overflow = '';
		document.body.style.paddingRight = '';
	}
	
	// Обработчик кнопки "Забронировать"
	document.getElementById('bookFromInfoBtn').addEventListener('click', async function() {
		const bookingId = document.getElementById('bookingInfoModal').getAttribute('data-booking-id');
		try {
			await axios.put(`/api/bookings/${bookingId}/approve`, {}, {
				headers: { 'Authorization': `Bearer ${adminToken}` }
			});
			alert('Бронирование подтверждено!');
			await loadAdminData();
			this.style.display = 'none';
		} catch (error) {
			console.error('Error approving booking:', error);
			alert('Ошибка подтверждения бронирования');
		}
	});

	async function bookEvent(eventId) {
		try {
			const formData = {
				eventId: document.getElementById('eventId').value,
				userName: document.getElementById('userName').value,
				organization: document.getElementById('organization').value,
				participantsCount: parseInt(document.getElementById('participantsCount').value),
				participantsAge: document.getElementById('participantsAge').value,
				phone: document.getElementById('phone').value,
				comments: document.getElementById('comments').value
			};

			const response = await axios.post('/api/bookings', formData);
			alert('Бронирование успешно создано! При необходимости с Вами свяжется специалист библиотеки.');
			calendar.refetchEvents();
		} catch (error) {
			console.error('Booking error:', error);
			alert(`Ошибка: ${error.response?.data?.message || error.message}`);
		}
	}

    // Добавление глобальных функций для админ-панели
    // Функция удаления мероприятия
	window.deleteEvent = async function(eventId) {
		if (!confirm('Это действие удалит мероприятие и все связанные бронирования. Продолжить?')) {
			return;
		}

		try {
			const response = await axios.delete(`/api/events/${eventId}`, {
				headers: {
					'Authorization': `Bearer ${adminToken}`
				}
			});

			if (response.data.success) {
				alert(response.data.message || 'Мероприятие и связанные бронирования удалены');
				await loadAdminData();
				calendar.refetchEvents();
			} else {
				throw new Error(response.data.message || 'Не удалось удалить мероприятие');
			}
		} catch (error) {
			console.error('Delete event error:', error);
			alert(`Ошибка: ${error.response?.data?.message || error.message}`);
		}
	};
	
	// Обработчик сохранения комментария
	document.getElementById('saveAdminCommentsBtn').addEventListener('click', async function() {
		const bookingId = document.getElementById('bookingInfoModal').getAttribute('data-booking-id');
		const comments = document.getElementById('adminCommentsEdit').value;
		
		try {
			await axios.patch(`/api/bookings/${adminToken ? `${bookingId}/comments` : ''}`, {
				adminComments: comments
			}, {
				headers: { 'Authorization': `Bearer ${adminToken}` }
			});
			
			alert('Комментарий сохранён');
		} catch (error) {
			console.error('Error saving comments:', error);
			alert('Ошибка сохранения комментария');
		}
	});

    window.approveBooking = async function(bookingId) {
		if (!confirm('Вы уверены, что хотите подтвердить это бронирование?')) {
			return;
		}

		try {
			// Используем axios напрямую с правильными заголовками
			const response = await axios.put(
				`/api/bookings/${bookingId}/approve`,
				{}, // Пустое тело запроса
				{
					headers: {
						'Authorization': `Bearer ${adminToken}`,
						'Content-Type': 'application/json'
					}
				}
			);

			if (response.data.success) {
				alert('Бронирование подтверждено!');
				// Обновляем данные
				await loadAdminData();
				calendar.refetchEvents();
			} else {
				throw new Error(response.data.message || 'Неизвестная ошибка');
			}
		} catch (error) {
			console.error('Error approving booking:', error);
			
			// Более информативное сообщение об ошибке
			let errorMessage = 'Ошибка при подтверждении бронирования';
			if (error.response) {
				errorMessage += `: ${error.response.data.message || error.response.statusText}`;
			} else {
				errorMessage += `: ${error.message}`;
			}
			
			alert(errorMessage);
			
			// Если ошибка авторизации - разлогиниваем
			if (error.response?.status === 401 || error.response?.status === 403) {
				adminLogout();
			}
		}
	};

    window.deleteBooking = async function(bookingId) {
		if (!confirm('Вы уверены, что хотите удалить это бронирование?\nМероприятие станет доступно для новых бронирований.')) {
			return;
		}

		try {
			const response = await axios.delete(`/api/bookings/${bookingId}`, {
				headers: {
					'Authorization': `Bearer ${adminToken}`
				}
			});

			if (response.data.success) {
				alert(response.data.message);
				// Обновляем обе таблицы
				await loadAdminData();
				calendar.refetchEvents();
			} else {
				throw new Error(response.data.message || 'Не удалось удалить бронирование');
			}
		} catch (error) {
			console.error('Delete booking error:', error);
			alert(`Ошибка: ${error.response?.data?.message || error.message}`);
			
			// Если ошибка авторизации - разлогиниваем
			if (error.response?.status === 401 || error.response?.status === 403) {
				adminLogout();
			}
		}
	};
	
	// Функция сброса фильтров
	window.resetAdminFilters = function() {
		document.getElementById('adminTitleFilter').value = '';
		document.getElementById('adminDateFrom').value = '';
		document.getElementById('adminDateTo').value = '';
		document.getElementById('adminResponsibleFilter').value = '';
		document.getElementById('adminStatusFilter').value = '';
		document.getElementById('adminPriceTypeFilter').value = '';
		document.getElementById('adminVisibilityFilter').value = '';
		
		applyAdminFilters();
	};

	// обработчик формы добавления мероприятия
	document.getElementById('addEventForm').addEventListener('submit', async function(e) {
		e.preventDefault();
		
		try {
			const formData = new FormData();
			
			// Добавляем текстовые данные
			formData.append('title', document.getElementById('newEventTitle').value.trim());
			formData.append('description', document.getElementById('newEventDescription').value.trim());
			formData.append('date', document.getElementById('newEventDate').value);
			formData.append('time', document.getElementById('newEventTime').value);
			formData.append('duration', document.getElementById('newEventDuration').value);
			formData.append('minAge', document.getElementById('newEventMinAge').value);
			formData.append('maxAge', document.getElementById('newEventMaxAge').value);
			formData.append('theme', document.getElementById('newEventTheme').value);
			formData.append('priceType', document.getElementById('newEventPriceType').value);
			formData.append('imagesDescription', document.getElementById('newEventImagesDescription').value.trim());
			
			// ДОБАВЛЯЕМ ВИДИМОСТЬ (чекбокс "Показывать в календаре")
			const isVisible = document.getElementById('newEventVisible').checked;
			formData.append('visible', isVisible.toString());
		
			// Добавляем цену если мероприятие платное
			if (document.getElementById('newEventPriceType').value === 'paid') {
				formData.append('price', document.getElementById('newEventPrice').value);
			}
			
			// Добавляем ответственного
			const responsibleInput = document.getElementById('eventResponsible');
			if (adminToken && responsibleInput) {
				formData.append('responsible', responsibleInput.value || '');
			}
			
			// ДОБАВЛЯЕМ СКОПИРОВАННЫЕ КАРТИНКИ ИЗ ГЛОБАЛЬНОЙ ПЕРЕМЕННОЙ
			if (copiedImages.length > 0) {
				copiedImages.forEach(imageUrl => {
					if (imageUrl && imageUrl.trim()) {
						formData.append('copiedImages', imageUrl.trim());
					}
				});
				console.log('Added copied images to form:', copiedImages.length);
			}
			
			// Добавляем новые файлы изображений
			const filesInput = document.getElementById('newEventImages');
			if (filesInput && filesInput.files) {
				const files = Array.from(filesInput.files);
				
				// Сжимаем каждое изображение
				for (let file of files) {
					if (file.type.startsWith('image/')) {
						try {
							// ВЫЗОВ ФУНКЦИИ СЖАТИЯ
							const compressedFile = await compressImage(file, 500, 0.8);
							formData.append('images', compressedFile);
							console.log(`Изображение сжато: ${file.name} -> ${compressedFile.size} bytes`);
						} catch (error) {
							console.warn(`Не удалось сжать ${file.name}:`, error);
							// Если сжатие не удалось, добавляем оригинальный файл
							formData.append('images', file);
						}
					} else {
						// Для не-изображений добавляем как есть
						formData.append('images', file);
					}
				}
			}

			console.log('FormData contents:');
			for (let pair of formData.entries()) {
				console.log(pair[0] + ': ' + pair[1]);
			}

			const response = await makeAuthRequest({
				method: 'POST',
				url: '/api/events',
				data: formData,
				headers: {
					'Content-Type': 'multipart/form-data'
				}
			});

			alert('Мероприятие добавлено!');
			
			clearAddEventForm();
			
			this.reset();
			
			// Очищаем превью
			const previewContainer = document.getElementById('imagePreviews');
			if (previewContainer) previewContainer.innerHTML = '';
			
			await loadAdminData();
			calendar.refetchEvents();
		} catch (error) {
			console.error('Error adding event:', error);
			alert(`Ошибка: ${error.response?.data?.message || error.message}`);
		}
	});
	
	// функция сжатия изображений при добавлении мероприятия
	function compressImage(file, maxWidth = 500, quality = 0.8) {
		return new Promise((resolve, reject) => {
			// Проверяем поддержку WebP (лучший формат)
			const supportsWebP = () => {
				const canvas = document.createElement('canvas');
				if (canvas.getContext && canvas.getContext('2d')) {
					return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
				}
				return false;
			};

			const reader = new FileReader();
			reader.readAsDataURL(file);
			
			reader.onload = function(event) {
				const img = new Image();
				img.src = event.target.result;
				
				img.onload = function() {
					const canvas = document.createElement('canvas');
					const ctx = canvas.getContext('2d');
					
					let width = img.width;
					let height = img.height;
					
					if (width > maxWidth) {
						height = (height * maxWidth) / width;
						width = maxWidth;
					}
					
					canvas.width = width;
					canvas.height = height;
					ctx.drawImage(img, 0, 0, width, height);
					
					// ВЫБИРАЕМ ОПТИМАЛЬНЫЙ ФОРМАТ
					let outputFormat, outputQuality, fileExtension;
					
					if (supportsWebP()) {
						// WebP - лучший выбор (хорошее сжатие + качество)
						outputFormat = 'image/webp';
						outputQuality = quality;
						fileExtension = '.webp';
					} else if (file.type === 'image/png' && hasTransparency(img)) {
						// PNG с прозрачностью - сохраняем как PNG
						outputFormat = 'image/png';
						outputQuality = 0.9;
						fileExtension = '.png';
					} else {
						// Для всего остального используем JPEG
						outputFormat = 'image/jpeg';
						outputQuality = quality;
						fileExtension = '.jpg';
					}
					
					canvas.toBlob(
						(blob) => {
							if (blob) {
								const newFileName = file.name.replace(/\.[^/.]+$/, "") + fileExtension;
								const compressedFile = new File([blob], newFileName, {
									type: outputFormat,
									lastModified: Date.now()
								});
								
								console.log(`Сжато: ${file.name} (${file.type}) -> ${newFileName} (${outputFormat})`);
								resolve(compressedFile);
							} else {
								reject(new Error('Ошибка сжатия изображения'));
							}
						},
						outputFormat,
						outputQuality
					);
				};
				
				img.onerror = reject;
			};
			
			reader.onerror = reject;
		});
	}

	// Функция проверки прозрачности (для PNG)
	function hasTransparency(img) {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
		canvas.width = img.width;
		canvas.height = img.height;
		ctx.drawImage(img, 0, 0);
		
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const data = imageData.data;
		
		for (let i = 3; i < data.length; i += 4) {
			if (data[i] < 255) {
				return true; // Найден прозрачный пиксель
			}
		}
		return false;
	}
	
	// Функция для полной очистки формы добавления мероприятия
	function clearAddEventForm() {
		// Очищаем глобальную переменную
		copiedImages = [];
		
		// Сбрасываем форму
		document.getElementById('addEventForm').reset();
		
		// Очищаем превью изображений
		const previewContainer = document.getElementById('imagePreviews');
		if (previewContainer) {
			previewContainer.innerHTML = '';
		}
		
		// Удаляем сообщение о скопированных изображениях
		const message = document.getElementById('copiedImagesMessage');
		if (message) {
			message.remove();
		}
		
		// Сбрасываем поле цены (скрываем если бесплатно)
		const priceTypeElement = document.getElementById('newEventPriceType');
		if (priceTypeElement) {
			priceTypeElement.value = 'gratis';
			priceTypeElement.dispatchEvent(new Event('change'));
		}
		
		console.log('Add event form cleared completely');
	}

    // Получение названия статуса
    function getStatusName(status) {
        const statuses = {
            'free': 'Свободно',
            'pending': 'Ожидание',
            'booked': 'Занято',
			'auto-pending': 'Ожидание (авто)'											
        };
        return statuses[status] || status;
    }
	  
	// Функция для определения активного месяца
	function getActiveMonth(view) {
		const activeDate = view.currentStart;
		// Берем 15 число месяца, чтобы гарантированно попасть в нужный месяц
		const middleOfMonth = new Date(activeDate);
		middleOfMonth.setDate(15);
		return middleOfMonth.getMonth();
	}

	// Обработчик изменения фильтра
	monthFilter.addEventListener('change', function() {
		const currentDate = calendar.getDate();
		calendar.gotoDate(new Date(currentDate.getFullYear(), this.value, 1));
	});

	// Синхронизация фильтра при изменении вида календаря
	calendar.on('datesSet', function(info) {
		const activeMonth = getActiveMonth(info.view);
		monthFilter.value = activeMonth;
	});
	
	setTimeout(() => {
		const applyBtn = document.getElementById('applyAdminFiltersBtn');
		if (applyBtn) {
			applyBtn.addEventListener('click', applyAdminFilters);
		}
	}, 100);
	
	// Автоматическое применение фильтров при изменении
    const filterIds = [
        'adminTitleFilter', 
        'adminDateFrom', 
        'adminDateTo', 
        'adminResponsibleFilter', 
        'adminStatusFilter',
        'adminPriceTypeFilter',
        'adminVisibilityFilter'
    ];
    
    filterIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', applyAdminFilters);
            if (id === 'adminTitleFilter') {
                element.addEventListener('input', applyAdminFilters);
            }
        }
    });
});