document.getElementById('year').textContent = new Date().getFullYear();

/* ==================================================================
   ESTADO / PERSISTENCIA
   ================================================================== */

const DOW = [
  'Dom',
  'Lun',
  'Mar',
  'Mié',
  'Jue',
  'Vie',
  'Sáb'
];

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
];

const SERVICE_LABELS = {
  suelta: 'Clase suelta de perfeccionamiento',
  curso: 'Curso integral - Mi Primera Licencia'
};

function uid(prefix){
  return (
    prefix +
    '_' +
    Math.random().toString(36).slice(2, 9)
  );
}

function todayISO(){
  return toISO(new Date());
}

function toISO(date){
  return (
    date.getFullYear() +
    '-' +
    String(date.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getDate()).padStart(2, '0')
  );
}

function fmtMoney(number){
  return (
    '$' +
    Number(number).toLocaleString('es-AR')
  );
}

function fmtDateHuman(iso){
  const [year, month, day] = iso
    .split('-')
    .map(Number);

  return (
    day +
    ' de ' +
    MONTHS[month - 1] +
    ' de ' +
    year
  );
}

function normalizeArgentineWhatsApp(phone){
  let digits = String(phone || '')
    .replace(/\D/g, '');

  if(!digits){
    return '';
  }

  if(digits.startsWith('00')){
    digits = digits.slice(2);
  }

  if(
    digits.startsWith('549') &&
    digits.length === 13
  ){
    return digits;
  }

  if(digits.startsWith('549')){
    digits = digits.slice(3);
  }else if(digits.startsWith('54')){
    digits = digits.slice(2);

    if(digits.startsWith('9')){
      digits = digits.slice(1);
    }
  }

  if(digits.startsWith('0')){
    digits = digits.slice(1);
  }

  if(digits.length !== 10){
    return '';
  }

  return '549' + digits;
}

function waLink(phone, text){
  const normalizedPhone =
    normalizeArgentineWhatsApp(phone);

  if(!normalizedPhone){
    return '#';
  }

  return (
    'https://wa.me/' +
    normalizedPhone +
    '?text=' +
    encodeURIComponent(text)
  );
}

function defaultDB(){
  return {
    services: {
      suelta: {
        price: 12000,
        desc:
          'Clase de perfeccionamiento individual de 45 minutos, en el auto de la alumna.'
      },

      curso: {
        price: 130000,
        desc:
          'Preparación teórica para el examen + práctica de manejo completa, a tu ritmo.'
      },

      packs: []
    },

    promos: [],

    settings: {
      whatsapp: '',
      instagram: '',
      zonas: '',
      requisitos: '',
      autoPropio: '',
      cancelacion: ''
    },

    schedule: {
      availability: {},
      blocked: {}
    },

    bookings: [],
    students: [],
    reviews: [],
    messages: [],
    gallery: []
  };
}

let DB = defaultDB();
let dbReady = false;
let adminAuthed = false;

function shortTime(value){
  return String(value || '').slice(0, 5);
}

function requireNoError(result, label){
  if(result.error){
    throw new Error(
      label +
      ': ' +
      result.error.message
    );
  }

  return result.data || [];
}

function mapServices(rows){
  const result = defaultDB().services;

  rows.forEach(row=>{
    const item = {
      id: row.id,
      name: row.name,
      classes: row.classes,
      price: Number(row.price) || 0,
      desc: row.description || ''
    };

    if(
      row.id === 'suelta' ||
      row.service_type === 'single'
    ){
      result.suelta = {
        price: item.price,
        desc: item.desc
      };

      return;
    }

    if(
      row.id === 'curso' ||
      row.service_type === 'course'
    ){
      result.curso = {
        price: item.price,
        desc: item.desc
      };

      return;
    }

    if(row.service_type === 'pack'){
      result.packs.push(item);
    }
  });

  result.packs.sort(
    (a, b)=>
      (a.classes || 0) -
      (b.classes || 0)
  );

  return result;
}

function mapAvailability(rows){
  const availability = {};

  rows.forEach(row=>{
    const date = row.class_date;
    const time = shortTime(
      row.class_time
    );

    if(!availability[date]){
      availability[date] = [];
    }

    if(
      !availability[date].includes(time)
    ){
      availability[date].push(time);
      availability[date].sort();
    }
  });

  return availability;
}

function mapBlockedDays(rows){
  const blocked = {};

  rows.forEach(row=>{
    blocked[row.class_date] = true;
  });

  return blocked;
}

function mapBookings(
  rows,
  publicOnly = false
){
  return rows.map((row, index)=>({
    id:
      row.id ||
      (
        'occupied_' +
        row.class_date +
        '_' +
        shortTime(row.class_time) +
        '_' +
        index
      ),

    date: row.class_date,
    time: shortTime(row.class_time),

    name: publicOnly
      ? ''
      : (row.student_name || ''),

    phone: publicOnly
      ? ''
      : (row.phone || ''),

    service: publicOnly
      ? ''
      : (row.service_id || ''),

    status: publicOnly
      ? 'confirmed'
      : (row.status || 'pending'),

    createdAt:
      row.created_at || null
  }));
}

function mapReviews(rows){
  return rows.map(row=>({
    id: row.id,
    name: row.name || '',
    rating: Number(row.rating) || 0,
    comment: row.comment || '',
    status: row.status || 'pending',
    reply: row.reply || '',
    date: row.created_at || null
  }));
}

function mapGallery(rows){
  return rows.map(row=>({
    id: row.id,
    name: row.name || '',
    desc: row.description || '',
    image: row.image_url || '',
    storagePath:
      row.storage_path || '',
    visible:
      row.visible !== false,
    date:
      row.created_at || null
  }));
}

function mapStudents(rows){
  return rows.map(row=>({
    id: row.id,
    name: row.name || '',
    phone: row.phone || '',
    classesTaken:
      Number(row.classes_taken) || 0,
    progress: row.progress || ''
  }));
}

function mapMessages(rows){
  return rows.map(row=>({
    id: row.id,
    name: row.name || '',
    contact: row.contact || '',
    message: row.message || '',
    read: Boolean(row.is_read),
    date: row.created_at
  }));
}

async function loadRemoteData(
  includePrivate = false
){
  const today = todayISO();

  let servicesQuery = supabaseClient
    .from('services')
    .select('*')
    .order(
      'created_at',
      { ascending: true }
    );

  let promosQuery = supabaseClient
    .from('promos')
    .select('*')
    .order(
      'created_at',
      { ascending: false }
    );

  let reviewsQuery = supabaseClient
    .from('reviews')
    .select('*')
    .order(
      'created_at',
      { ascending: false }
    );

  let galleryQuery = supabaseClient
    .from('gallery')
    .select('*')
    .order(
      'created_at',
      { ascending: false }
    );

  if(!includePrivate){
    servicesQuery =
      servicesQuery.eq(
        'active',
        true
      );

    promosQuery =
      promosQuery.eq(
        'active',
        true
      );

    reviewsQuery =
      reviewsQuery.eq(
        'status',
        'approved'
      );

    galleryQuery =
      galleryQuery.eq(
        'visible',
        true
      );
  }

  const commonRequests = [
    servicesQuery,
    promosQuery,

    supabaseClient
      .from('site_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle(),

    supabaseClient
      .from('availability')
      .select(
        'class_date,class_time'
      )
      .gte(
        'class_date',
        today
      )
      .order(
        'class_date',
        { ascending: true }
      )
      .order(
        'class_time',
        { ascending: true }
      ),

    supabaseClient
      .from('blocked_days')
      .select('class_date')
      .gte(
        'class_date',
        today
      )
      .order(
        'class_date',
        { ascending: true }
      ),

    reviewsQuery,
    galleryQuery
  ];

  const privateRequests =
    includePrivate
      ? [
          supabaseClient
            .from('bookings')
            .select('*')
            .order(
              'class_date',
              { ascending: true }
            )
            .order(
              'class_time',
              { ascending: true }
            ),

          supabaseClient
            .from('students')
            .select('*')
            .order(
              'created_at',
              { ascending: false }
            ),

          supabaseClient
            .from('messages')
            .select('*')
            .order(
              'created_at',
              { ascending: false }
            )
        ]
      : [
          supabaseClient.rpc(
            'get_booked_slots'
          )
        ];

  const results =
    await Promise.all([
      ...commonRequests,
      ...privateRequests
    ]);

  const servicesRows =
    requireNoError(
      results[0],
      'No se pudieron cargar los servicios'
    );

  const promosRows =
    requireNoError(
      results[1],
      'No se pudieron cargar las promociones'
    );

  if(results[2].error){
    throw new Error(
      'No se pudieron cargar los ajustes: ' +
      results[2].error.message
    );
  }

  const settingsRow =
    results[2].data || {};

  const availabilityRows =
    requireNoError(
      results[3],
      'No se pudieron cargar los horarios'
    );

  const blockedRows =
    requireNoError(
      results[4],
      'No se pudieron cargar los días bloqueados'
    );

  const reviewsRows =
    requireNoError(
      results[5],
      'No se pudieron cargar las reseñas'
    );

  const galleryRows =
    requireNoError(
      results[6],
      'No se pudo cargar la galería'
    );

  DB.services =
    mapServices(servicesRows);

  DB.promos =
    promosRows.map(row=>({
      id: row.id,
      title: row.title || '',
      desc:
        row.description || '',
      badge: row.badge || '',
      active:
        row.active !== false
    }));

  DB.settings = {
    whatsapp:
      settingsRow.whatsapp || '',

    instagram:
      settingsRow.instagram || '',

    zonas:
      settingsRow.zones || '',

    requisitos:
      settingsRow.requirements || '',

    autoPropio:
      settingsRow.own_car || '',

    cancelacion:
      settingsRow
        .cancellation_policy || ''
  };

  DB.schedule = {
    availability:
      mapAvailability(
        availabilityRows
      ),

    blocked:
      mapBlockedDays(
        blockedRows
      )
  };

  DB.reviews =
    mapReviews(reviewsRows);

  DB.gallery =
    mapGallery(galleryRows);

  if(includePrivate){
    DB.bookings =
      mapBookings(
        requireNoError(
          results[7],
          'No se pudieron cargar las reservas'
        )
      );

    DB.students =
      mapStudents(
        requireNoError(
          results[8],
          'No se pudieron cargar las alumnas'
        )
      );

    DB.messages =
      mapMessages(
        requireNoError(
          results[9],
          'No se pudieron cargar los mensajes'
        )
      );
  }else{
    DB.bookings =
      mapBookings(
        requireNoError(
          results[7],
          'No se pudieron consultar los turnos ocupados'
        ),
        true
      );

    DB.students = [];
    DB.messages = [];
  }

  dbReady = true;
}

async function loadDB(){
  DB = defaultDB();

  await loadRemoteData(false);
}

async function loadAdminData(){
  await loadRemoteData(true);
}

async function refreshPublicSchedule(){
  const today = todayISO();

  const [
    availabilityResult,
    blockedResult,
    bookedResult
  ] = await Promise.all([
    supabaseClient
      .from('availability')
      .select(
        'class_date,class_time'
      )
      .gte(
        'class_date',
        today
      )
      .order(
        'class_date',
        { ascending: true }
      )
      .order(
        'class_time',
        { ascending: true }
      ),

    supabaseClient
      .from('blocked_days')
      .select('class_date')
      .gte(
        'class_date',
        today
      ),

    supabaseClient.rpc(
      'get_booked_slots'
    )
  ]);

  DB.schedule.availability =
    mapAvailability(
      requireNoError(
        availabilityResult,
        'No se pudieron actualizar los horarios'
      )
    );

  DB.schedule.blocked =
    mapBlockedDays(
      requireNoError(
        blockedResult,
        'No se pudieron actualizar los días bloqueados'
      )
    );

  DB.bookings =
    mapBookings(
      requireNoError(
        bookedResult,
        'No se pudieron actualizar los turnos ocupados'
      ),
      true
    );
}

function showDatabaseError(
  error,
  fallbackMessage
){
  console.error(
    fallbackMessage,
    error
  );

  alert(
    fallbackMessage +
    (
      error?.message
        ? '\n\n' + error.message
        : ''
    )
  );
}

/* ==================================================================
   NAVEGACIÓN PÚBLICA
   ================================================================== */

const PUB_SECTIONS = [
  {
    id: 'inicio',
    label: 'Inicio'
  },
  {
    id: 'servicios',
    label: 'Servicios y precios'
  },
  {
    id: 'reservas',
    label: 'Reservas'
  },
  {
    id: 'galeria',
    label: 'Egresadas'
  },
  {
    id: 'resenas',
    label: 'Reseñas'
  },
  {
    id: 'faq',
    label: 'Preguntas frecuentes'
  },
  {
    id: 'contacto',
    label: 'Contacto'
  }
];

let currentPub = 'inicio';

function toggleMobileNav(){
  document
    .getElementById('pub-nav')
    .classList
    .toggle('open');
}

async function goPublic(id){
  currentPub = id;

  document
    .querySelectorAll(
      '#pub-nav button'
    )
    .forEach(button=>{
      button.classList.toggle(
        'active',
        button.dataset.id === id
      );
    });

  document
    .querySelectorAll(
      '#pub-sections > section'
    )
    .forEach(section=>{
      section.classList.toggle(
        'hidden',
        section.id !==
          'sec-' + id
      );
    });

  document
    .getElementById('pub-nav')
    .classList
    .remove('open');

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });

  try{
    if(id === 'reservas'){
      await refreshPublicSchedule();
      renderCalendarPublic();
    }

    if(id === 'galeria'){
      renderGalleryPublic();
    }

    if(id === 'resenas'){
      renderReviewsPublic();
    }

    if(id === 'servicios'){
      renderServicesPublic();
    }

    if(id === 'faq'){
      renderFAQ();
    }

    if(id === 'contacto'){
      renderContact();
    }
  }catch(error){
    console.error(
      'No se pudo actualizar la sección pública:',
      error
    );

    if(id === 'reservas'){
      const panel =
        document.getElementById(
          'slot-panel'
        );

      if(panel){
        panel.innerHTML = `
          <div class="error-box">
            No se pudieron cargar los horarios.
            Revisá tu conexión e intentá nuevamente.
          </div>
        `;
      }
    }
  }
}

function renderPublicNav(){
  document
    .getElementById('pub-nav')
    .innerHTML =
      PUB_SECTIONS
        .map(section=>`
          <button
            data-id="${section.id}"
            class="${
              section.id === currentPub
                ? 'active'
                : ''
            }"
            onclick="goPublic('${section.id}')"
          >
            ${section.label}
          </button>
        `)
        .join('');
}

/* ==================================================================
   RENDER: INICIO
   ================================================================== */

function renderHero(){
  return `
    <section id="sec-inicio">
      <div class="hero">
        <div class="wrap">
          <div>
            <div
              class="eyebrow"
              style="color:var(--amber)"
            >
              Clases de manejo en Tucumán
            </div>

            <h1>
              Aprendé a manejar con
              <em>paciencia y seguridad</em>,
              practicando con tu propio auto.
            </h1>

            <p class="sub">
              Clases personalizadas a tu ritmo,
              para perder el miedo al volante
              o sacar tu primera licencia.
              Las clases se dictan siempre en
              el auto de la alumna: aprendés
              desde el primer día con el
              vehículo que después vas a usar.
            </p>

            <div class="ctas">
              <button
                class="cta-btn"
                onclick="goPublic('reservas')"
              >
                Reservar ahora
              </button>

              <button
                class="cta-btn ghost"
                onclick="goPublic('servicios')"
              >
                Ver precios
              </button>
            </div>

            <div class="badge-row">
              <div class="badge">
                ${icon('heart')}
                Paciencia, a tu ritmo
              </div>

              <div class="badge">
                ${icon('shield')}
                Clases seguras
              </div>

              <div class="badge">
                ${icon('wheel')}
                Se enseña con tu propio auto
              </div>
            </div>
          </div>

          <div class="wheel">
            ${wheelSVG()}
          </div>
        </div>
      </div>
    </section>
  `;
}

function icon(name){
  const paths = {
    heart:
      'M12 20s-7-4.4-9.3-8.8C1.2 8 2.6 5 5.7 5c1.8 0 3.1 1 4.3 2.4C11.2 6 12.5 5 14.3 5c3.1 0 4.5 3 3 6.2C19.3 15.6 12 20 12 20z',

    shield:
      'M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z',

    wheel:
      'M12 3v3M12 18v3M3 12h3M18 12h3M12 12l4.2-4.2M12 12L7.8 16.2M12 12l4.2 4.2M12 12L7.8 7.8'
  };

  const circle =
    name === 'wheel'
      ? `
        <circle
          cx="12"
          cy="12"
          r="8"
        />
        <circle
          cx="12"
          cy="12"
          r="2.4"
        />
      `
      : '';

  return `
    <svg
      class="icon"
      viewBox="0 0 24 24"
    >
      ${circle}
      <path d="${paths[name]}"/>
    </svg>
  `;
}

function wheelSVG(){
  return `
    <svg
      viewBox="0 0 300 300"
      width="100%"
    >
      <circle
        cx="150"
        cy="150"
        r="120"
        fill="none"
        stroke="#3A4C61"
        stroke-width="18"
      />

      <circle
        cx="150"
        cy="150"
        r="120"
        fill="none"
        stroke="#E8A33D"
        stroke-width="4"
        stroke-dasharray="6 14"
      />

      <circle
        cx="150"
        cy="150"
        r="34"
        fill="#E8A33D"
      />

      <path
        d="
          M150 150 L150 60
          M150 150 L72 195
          M150 150 L228 195
        "
        stroke="#3A4C61"
        stroke-width="14"
        stroke-linecap="round"
      />

      <circle
        cx="150"
        cy="150"
        r="14"
        fill="#1E2A38"
      />
    </svg>
  `;
}

/* ==================================================================
   RENDER: SERVICIOS Y PROMOS
   ================================================================== */

function renderServicesPublic(){
  const services = DB.services;

  const activePromos =
    DB.promos.filter(
      promo=>promo.active
    );

  document
    .getElementById(
      'services-cards'
    )
    .innerHTML = `
      <div class="grid3">
        <div class="card">
          <h3>Clase suelta</h3>

          <p>
            ${services.suelta.desc}
          </p>

          <div class="price">
            ${fmtMoney(
              services.suelta.price
            )}

            <small>/ clase</small>
          </div>

          <button
            class="cta-btn small"
            onclick="goPublic('reservas')"
          >
            Reservar clase
          </button>
        </div>

        ${
          services.packs
            .map(pack=>`
              <div class="card">
                <span class="pack-tag">
                  ${pack.classes} clases
                </span>

                <h3>
                  ${escapeHTML(pack.name)}
                </h3>

                <p>
                  Ideal si querés practicar seguido
                  y afianzar la confianza al volante.
                </p>

                <div class="price">
                  ${fmtMoney(pack.price)}
                </div>

                <button
                  class="cta-btn small"
                  onclick="goPublic('reservas')"
                >
                  Reservar clase
                </button>
              </div>
            `)
            .join('')
        }
      </div>

      <div
        class="grid3"
        style="margin-top:20px;"
      >
        <div
          class="card"
          style="grid-column:1/-1;"
        >
          <span
            class="pack-tag"
            style="
              background:var(--brick-dim);
              color:var(--brick);
            "
          >
            Curso integral
          </span>

          <h3>
            Mi Primera Licencia
          </h3>

          <p>
            ${services.curso.desc}
          </p>

          <div class="price">
            ${fmtMoney(
              services.curso.price
            )}
          </div>

          <button
            class="cta-btn small"
            onclick="goPublic('reservas')"
          >
            Reservar clase
          </button>
        </div>
      </div>
    `;

  document
    .getElementById(
      'promos-strip'
    )
    .innerHTML =
      activePromos.length
        ? `
          <h3 style="margin-bottom:14px;">
            Promos activas
          </h3>

          ${
            activePromos
              .map(promo=>`
                <div class="promo-card">
                  <div>
                    <h4>
                      ${escapeHTML(
                        promo.title
                      )}
                    </h4>

                    <p>
                      ${escapeHTML(
                        promo.desc
                      )}
                    </p>
                  </div>

                  ${
                    promo.badge
                      ? `
                        <span class="promo-badge">
                          ${escapeHTML(
                            promo.badge
                          )}
                        </span>
                      `
                      : ''
                  }
                </div>
              `)
              .join('')
          }
        `
        : '';
}

/* ==================================================================
   RENDER: CALENDARIO PÚBLICO Y RESERVA
   ================================================================== */

let pubMonthOffset = 0;
let pubSelectedDate = null;
let pubSelectedTime = null;

function monthGridDates(offset){
  const now = new Date();

  const base = new Date(
    now.getFullYear(),
    now.getMonth() + offset,
    1
  );

  const year =
    base.getFullYear();

  const month =
    base.getMonth();

  const firstDow =
    new Date(
      year,
      month,
      1
    ).getDay();

  const daysInMonth =
    new Date(
      year,
      month + 1,
      0
    ).getDate();

  const cells = [];

  for(
    let index = 0;
    index < firstDow;
    index++
  ){
    cells.push(null);
  }

  for(
    let day = 1;
    day <= daysInMonth;
    day++
  ){
    cells.push(
      new Date(
        year,
        month,
        day
      )
    );
  }

  return {
    cells,
    year,
    month
  };
}

function slotsLeft(
  iso,
  excludeBookingId
){
  const all =
    DB.schedule
      .availability[iso] || [];

  const taken =
    DB.bookings
      .filter(booking=>
        booking.date === iso &&
        booking.status !==
          'cancelled' &&
        booking.id !==
          excludeBookingId
      )
      .map(
        booking=>booking.time
      );

  return all.filter(
    time=>!taken.includes(time)
  );
}

function renderCalendarPublic(){
  buildCalendar(
    'cal-public',
    pubMonthOffset,
    {
      onNav: delta=>{
        pubMonthOffset += delta;
        renderCalendarPublic();
      },

      onPick: iso=>{
        pubSelectedDate = iso;
        pubSelectedTime = null;

        renderSlotPanel();
        renderCalendarPublic();
      },

      selected:
        pubSelectedDate,

      mode: 'public'
    }
  );

  renderSlotPanel();
}

function buildCalendar(
  containerId,
  offset,
  options
){
  const {
    cells,
    year,
    month
  } = monthGridDates(offset);

  const todayIso =
    todayISO();

  const html = `
    <div class="cal-head">
      <button
        onclick="(${options.onNav.toString()})(-1)"
      >
        ‹
      </button>

      <div class="m-title">
        ${MONTHS[month]} ${year}
      </div>

      <button
        onclick="(${options.onNav.toString()})(1)"
      >
        ›
      </button>
    </div>

    <div class="cal-grid">
      ${
        DOW
          .map(day=>`
            <div class="cal-dow">
              ${day}
            </div>
          `)
          .join('')
      }

      ${
        cells
          .map(date=>{
            if(!date){
              return `
                <div class="cal-day pad"></div>
              `;
            }

            const iso =
              toISO(date);

            const isPast =
              iso < todayIso;

            const blocked =
              Boolean(
                DB.schedule
                  .blocked[iso]
              );

            const hasAvailability =
              Boolean(
                DB.schedule
                  .availability[iso]
              );

            const free =
              hasAvailability
                ? slotsLeft(iso).length
                : 0;

            let className =
              'cal-day';

            if(isPast){
              className +=
                ' past';
            }else if(blocked){
              className +=
                ' blocked';
            }else if(
              hasAvailability &&
              free > 0
            ){
              className +=
                ' avail';
            }else if(
              hasAvailability &&
              free === 0
            ){
              className +=
                ' full';
            }

            if(
              iso ===
              options.selected
            ){
              className +=
                ' selected';
            }

            const clickable =
              options.mode === 'admin'
                ? !isPast
                : (
                    !isPast &&
                    !blocked &&
                    hasAvailability
                  );

            return `
              <button
                class="${className}"
                ${
                  clickable
                    ? `
                      onclick="
                        (${options.onPick.toString()})
                        ('${iso}')
                      "
                    `
                    : 'disabled'
                }
              >
                ${date.getDate()}

                ${
                  hasAvailability &&
                  !isPast
                    ? `
                      <span class="dot"></span>
                    `
                    : ''
                }
              </button>
            `;
          })
          .join('')
      }
    </div>

    <div class="legend">
      <span>
        <i
          style="
            background:var(--sage-dim);
            border:1px solid var(--sage);
          "
        ></i>

        Con turnos libres
      </span>

      <span>
        <i
          style="
            background:var(--brick-dim);
            border:1px solid var(--brick);
          "
        ></i>

        Completo
      </span>

      <span>
        <i
          style="
            background:var(--cream-dim);
          "
        ></i>

        Sin atención
      </span>
    </div>
  `;

  document
    .getElementById(containerId)
    .innerHTML = html;
}

function renderSlotPanel(){
  const panel =
    document.getElementById(
      'slot-panel'
    );

  if(!panel){
    return;
  }

  if(!pubSelectedDate){
    panel.innerHTML = `
      <h3>Elegí un día</h3>

      <p
        class="lede"
        style="margin:0;"
      >
        Tocá una fecha con turnos libres
        en el calendario para ver los
        horarios disponibles.
      </p>
    `;

    return;
  }

  const free =
    slotsLeft(pubSelectedDate);

  panel.innerHTML = `
    <h3>
      ${fmtDateHuman(
        pubSelectedDate
      )}
    </h3>

    ${
      free.length
        ? `
          <p
            style="
              color:var(--ink-soft);
              font-size:14px;
            "
          >
            Elegí un horario:
          </p>

          <div class="slot-list">
            ${
              (
                DB.schedule
                  .availability[
                    pubSelectedDate
                  ] || []
              )
                .map(time=>{
                  const isFree =
                    free.includes(time);

                  return `
                    <button
                      class="
                        slot-btn
                        ${
                          pubSelectedTime === time
                            ? 'picked'
                            : ''
                        }
                      "
                      ${
                        isFree
                          ? `
                            onclick="
                              pickTime('${time}')
                            "
                          `
                          : 'disabled'
                      }
                    >
                      ${time}
                    </button>
                  `;
                })
                .join('')
            }
          </div>
        `
        : `
          <p class="note">
            No quedan horarios libres
            este día. Probá otra fecha.
          </p>
        `
    }

    ${
      pubSelectedTime
        ? bookingFormHTML()
        : ''
    }
  `;
}

function pickTime(time){
  pubSelectedTime = time;
  renderSlotPanel();
}

function bookingFormHTML(){
  const services = DB.services;

  return `
    <form
      onsubmit="return submitBooking(event)"
      style="
        margin-top:18px;
        border-top:1px solid var(--line);
        padding-top:18px;
      "
    >
      <div class="field">
        <label>
          Nombre y apellido
        </label>

        <input
          required
          id="bk-name"
          autocomplete="name"
        >
      </div>

      <div class="field">
        <label>
          Código de área
        </label>

        <input
          required
          id="bk-area-code"
          type="tel"
          inputmode="numeric"
          maxlength="4"
          placeholder="Ejemplo: 381 o 3865"
        >

        <p class="note">
          Escribilo sin el 0 inicial.
        </p>
      </div>

      <div class="field">
        <label>
          Número de WhatsApp
        </label>

        <input
          required
          id="bk-phone-number"
          type="tel"
          inputmode="numeric"
          maxlength="8"
          placeholder="Número sin 15"
        >

        <p class="note">
          Escribí solamente el número,
          sin 15 y sin +54 9.
        </p>
      </div>

      <div class="field">
        <label>
          Servicio
        </label>

        <select id="bk-service">
          <option value="suelta">
            Clase suelta —
            ${fmtMoney(
              services.suelta.price
            )}
          </option>

          ${
            services.packs
              .map(pack=>`
                <option value="${pack.id}">
                  ${escapeHTML(pack.name)} —
                  ${fmtMoney(pack.price)}
                </option>
              `)
              .join('')
          }

          <option value="curso">
            Curso integral -
            Mi Primera Licencia —
            ${fmtMoney(
              services.curso.price
            )}
          </option>
        </select>
      </div>

      <button
        class="cta-btn"
        type="submit"
        style="width:100%;"
      >
        Solicitar turno —
        ${fmtDateHuman(
          pubSelectedDate
        )}
        a las
        ${pubSelectedTime}
      </button>

      <div id="bk-msg"></div>
    </form>
  `;
}

async function submitBooking(event){
  event.preventDefault();

  const messageBox =
    document.getElementById(
      'bk-msg'
    );

  const submitButton =
    event.target.querySelector(
      'button[type="submit"]'
    );

  const name =
    document
      .getElementById('bk-name')
      .value
      .trim();

  const areaCode =
    document
      .getElementById(
        'bk-area-code'
      )
      .value
      .replace(/\D/g, '');

  const phoneNumber =
    document
      .getElementById(
        'bk-phone-number'
      )
      .value
      .replace(/\D/g, '');

  const service =
    document
      .getElementById(
        'bk-service'
      )
      .value;

  const nationalNumber =
    areaCode + phoneNumber;

  if(
    areaCode.length < 2 ||
    areaCode.length > 4 ||
    nationalNumber.length !== 10
  ){
    messageBox.innerHTML = `
      <div class="error-box">
        Revisá el teléfono ingresado.
        El código de área y el número
        deben sumar 10 dígitos.

        <br><br>

        Ejemplos:

        <br>
        381 + 1234567

        <br>
        3865 + 123456
      </div>
    `;

    return false;
  }

  const phone =
    '549' + nationalNumber;

  try{
    submitButton.disabled = true;
    submitButton.textContent =
      'Guardando reserva…';

    messageBox.innerHTML = '';

    await refreshPublicSchedule();

    if(
      !slotsLeft(pubSelectedDate)
        .includes(pubSelectedTime)
    ){
      messageBox.innerHTML = `
        <div class="error-box">
          Uy, ese horario acaba
          de ocuparse.
          Elegí otro.
        </div>
      `;

      renderCalendarPublic();

      return false;
    }

    const { error } =
      await supabaseClient
        .from('bookings')
        .insert({
          class_date:
            pubSelectedDate,

          class_time:
            pubSelectedTime,

          student_name:
            name,

          phone,

          service_id:
            service,

          status:
            'pending'
        });

    if(error){
      if(error.code === '23505'){
        await refreshPublicSchedule();
        renderCalendarPublic();

        const panel =
          document.getElementById(
            'slot-panel'
          );

        if(panel){
          panel.innerHTML += `
            <div class="error-box">
              Ese horario acaba de
              ser reservado por otra
              persona. Elegí otro turno.
            </div>
          `;
        }

        return false;
      }

      throw error;
    }

    const chosenTime =
      pubSelectedTime;

    const chosenDate =
      pubSelectedDate;

    pubSelectedTime = null;

    await refreshPublicSchedule();
    renderCalendarPublic();

    document
      .getElementById(
        'slot-panel'
      )
      .innerHTML += `
        <div class="success-box">
          ¡Listo,
          ${escapeHTML(name)}!

          Solicitaste el turno del
          ${fmtDateHuman(chosenDate)}
          a las ${chosenTime}.

          Te confirmamos por
          WhatsApp a la brevedad.
        </div>
      `;
  }catch(error){
    console.error(
      'No se pudo guardar la reserva:',
      error
    );

    messageBox.innerHTML = `
      <div class="error-box">
        No se pudo guardar la reserva.
        Revisá tu conexión e intentá
        nuevamente.
      </div>
    `;
  }finally{
    submitButton.disabled = false;

    if(
      pubSelectedDate &&
      pubSelectedTime
    ){
      submitButton.textContent =
        'Solicitar turno — ' +
        fmtDateHuman(
          pubSelectedDate
        ) +
        ' a las ' +
        pubSelectedTime;
    }
  }

  return false;
}

/* ==================================================================
   GALERÍA PÚBLICA
   ================================================================== */

function renderGalleryPublic(){
  const photos =
    (DB.gallery || [])
      .slice()
      .reverse();

  document
    .getElementById(
      'gallery-grid'
    )
    .innerHTML =
      photos.length
        ? photos
            .map(photo=>`
              <div class="gphoto">
                <img
                  src="${photo.image}"
                  alt="${
                    escapeHTML(
                      photo.name ||
                      'Alumna que finalizó el curso'
                    )
                  }"
                >

                <div class="gcap">
                  <div class="gname">
                    ${
                      escapeHTML(
                        photo.name ||
                        'Alumna'
                      )
                    }
                  </div>

                  ${
                    photo.desc
                      ? `
                        <div class="gdesc">
                          ${
                            escapeHTML(
                              photo.desc
                            )
                          }
                        </div>
                      `
                      : ''
                  }
                </div>
              </div>
            `)
            .join('')
        : `
          <div class="empty">
            Todavía no hay fotos cargadas.
            ¡Pronto vamos a compartir
            a las alumnas que terminen
            el curso!
          </div>
        `;
}

/* ==================================================================
   RESEÑAS PÚBLICAS
   ================================================================== */

function renderReviewsPublic(){
  const approved =
    DB.reviews.filter(
      review=>
        review.status === 'approved'
    );

  document
    .getElementById(
      'reviews-track'
    )
    .innerHTML =
      approved.length
        ? approved
            .map(review=>`
              <div class="review-card">
                <div class="stars">
                  ${'★'.repeat(
                    review.rating
                  )}
                  ${'☆'.repeat(
                    5 - review.rating
                  )}
                </div>

                <p
                  style="
                    margin:0;
                    font-size:14.5px;
                    color:var(--ink);
                  "
                >
                  ${
                    escapeHTML(
                      review.comment
                    )
                  }
                </p>

                <div class="who">
                  —
                  ${
                    escapeHTML(
                      review.name
                    )
                  }
                </div>

                ${
                  review.reply
                    ? `
                      <div class="reply-box">
                        <b>
                          Respuesta de la profe:
                        </b>

                        ${
                          escapeHTML(
                            review.reply
                          )
                        }
                      </div>
                    `
                    : ''
                }
              </div>
            `)
            .join('')
        : `
          <div class="empty">
            Todavía no hay reseñas
            publicadas. ¡Sé la primera
            en dejar tu opinión!
          </div>
        `;
}

async function submitReview(event){
  event.preventDefault();

  const form = event.target;

  const button =
    form.querySelector(
      'button[type="submit"]'
    );

  const messageBox =
    document.getElementById(
      'review-form-msg'
    );

  const name =
    document
      .getElementById('rv-name')
      .value
      .trim();

  const rating =
    Number(
      document
        .getElementById(
          'rv-rating'
        )
        .value
    );

  const comment =
    document
      .getElementById(
        'rv-comment'
      )
      .value
      .trim();

  try{
    button.disabled = true;
    button.textContent =
      'Enviando…';

    const { error } =
      await supabaseClient
        .from('reviews')
        .insert({
          name,
          rating,
          comment,
          status: 'pending',
          reply: ''
        });

    if(error){
      throw error;
    }

    messageBox.innerHTML = `
      <div class="success-box">
        ¡Gracias por tu opinión!
        Se publicará apenas sea
        revisada.
      </div>
    `;

    form.reset();
  }catch(error){
    console.error(
      'No se pudo enviar la reseña:',
      error
    );

    messageBox.innerHTML = `
      <div class="error-box">
        No se pudo enviar la reseña.
        Intentá nuevamente.
      </div>
    `;
  }finally{
    button.disabled = false;
    button.textContent =
      'Enviar opinión';
  }

  return false;
}

/* ==================================================================
   PREGUNTAS FRECUENTES
   ================================================================== */

function renderFAQ(){
  const settings = DB.settings;

  const items = [
    {
      q:
        '¿En qué zonas trabajan?',
      a:
        settings.zonas
    },
    {
      q:
        '¿Necesito auto propio para las clases?',
      a:
        settings.autoPropio
    },
    {
      q:
        '¿Qué necesito para empezar?',
      a:
        settings.requisitos
    },
    {
      q:
        '¿Cuál es la política de cancelación?',
      a:
        settings.cancelacion
    }
  ];

  document
    .getElementById(
      'faq-list'
    )
    .innerHTML =
      items
        .map((item, index)=>`
          <div
            class="faq-item"
            id="faq-${index}"
          >
            <button
              class="faq-q"
              onclick="toggleFaq(${index})"
            >
              <span>
                ${escapeHTML(item.q)}
              </span>

              <span class="chev">
                +
              </span>
            </button>

            <div class="faq-a">
              <inner>
                ${escapeHTML(item.a)}
              </inner>
            </div>
          </div>
        `)
        .join('');
}

function toggleFaq(index){
  const element =
    document.getElementById(
      'faq-' + index
    );

  const wasOpen =
    element.classList.contains(
      'open'
    );

  document
    .querySelectorAll(
      '.faq-item'
    )
    .forEach(item=>
      item.classList.remove('open')
    );

  if(!wasOpen){
    element.classList.add('open');
  }
}

/* ==================================================================
   CONTACTO
   ================================================================== */

function renderContact(){
  const settings = DB.settings;

  const hasWhatsApp =
    Boolean(settings.whatsapp);

  const contactLinks =
    document.getElementById(
      'contact-links'
    );

  if(contactLinks){
    contactLinks.innerHTML = `
      ${
        hasWhatsApp
          ? `
            <a
              href="${
                waLink(
                  settings.whatsapp,
                  'Hola! Quiero consultar por clases de manejo.'
                )
              }"
              target="_blank"
              rel="noopener noreferrer"
            >
              ${icon('shield')}
              WhatsApp: escribinos directo
            </a>
          `
          : ''
      }

      ${
        settings.instagram
          ? `
            <a
              href="
                https://instagram.com/
                ${settings.instagram}
              "
              target="_blank"
              rel="noopener noreferrer"
            >
              ${icon('heart')}
              Instagram
              @${escapeHTML(
                settings.instagram
              )}
            </a>
          `
          : ''
      }
    `;
  }

  const whatsAppButton =
    document.getElementById(
      'wa-float-btn'
    );

  if(!whatsAppButton){
    return;
  }

  if(hasWhatsApp){
    whatsAppButton
      .classList
      .remove('hidden');

    whatsAppButton.href =
      waLink(
        settings.whatsapp,
        'Hola! Quiero consultar por clases de manejo.'
      );
  }else{
    whatsAppButton
      .classList
      .add('hidden');
  }
}

async function submitContact(event){
  event.preventDefault();

  const form = event.target;

  const button =
    form.querySelector(
      'button[type="submit"]'
    );

  const messageBox =
    document.getElementById(
      'contact-form-msg'
    );

  const name =
    document
      .getElementById('ct-name')
      .value
      .trim();

  const contact =
    document
      .getElementById(
        'ct-contact'
      )
      .value
      .trim();

  const message =
    document
      .getElementById(
        'ct-message'
      )
      .value
      .trim();

  try{
    button.disabled = true;
    button.textContent =
      'Enviando…';

    const { error } =
      await supabaseClient
        .from('messages')
        .insert({
          name,
          contact,
          message,
          is_read: false
        });

    if(error){
      throw error;
    }

    messageBox.innerHTML = `
      <div class="success-box">
        ¡Mensaje enviado!
        Te respondemos a la brevedad.
      </div>
    `;

    form.reset();
  }catch(error){
    console.error(
      'No se pudo enviar el mensaje:',
      error
    );

    messageBox.innerHTML = `
      <div class="error-box">
        No se pudo enviar el mensaje.
        Intentá nuevamente.
      </div>
    `;
  }finally{
    button.disabled = false;
    button.textContent =
      'Enviar consulta';
  }

  return false;
}

/* ==================================================================
   CONSTRUCCIÓN DE SECCIONES PÚBLICAS
   ================================================================== */

function buildPublicSections(){
  document
    .getElementById(
      'pub-sections'
    )
    .innerHTML = `
      ${renderHero()}

      <section
        id="sec-servicios"
        class="hidden"
      >
        <div class="wrap">
          <div class="eyebrow">
            Servicios y precios
          </div>

          <h2 class="title">
            Elegí cómo querés aprender
          </h2>

          <p class="lede">
            Clases sueltas para
            perfeccionarte, packs para
            practicar seguido, o el curso
            completo para sacar tu
            primera licencia.
          </p>

          <div id="services-cards"></div>

          <div
            class="promos-strip"
            id="promos-strip"
          ></div>
        </div>
      </section>

      <section
        id="sec-reservas"
        class="hidden"
        style="
          background:var(--cream-dim);
        "
      >
        <div class="wrap">
          <div class="eyebrow">
            Reservas
          </div>

          <h2 class="title">
            Elegí tu turno
          </h2>

          <p class="lede">
            Mirá los días y horarios libres
            y solicitá tu clase.
            Te confirmamos por WhatsApp.
          </p>

          <div class="booking-grid">
            <div
              class="cal"
              id="cal-public"
            ></div>

            <div
              class="slot-panel"
              id="slot-panel"
            ></div>
          </div>
        </div>
      </section>

      <section
        id="sec-galeria"
        class="hidden"
      >
        <div class="wrap">
          <div class="eyebrow">
            Egresadas
          </div>

          <h2 class="title">
            Alumnas que ya se sacaron
            su licencia
          </h2>

          <p class="lede">
            Un poco de orgullo compartido:
            alumnas que terminaron el curso
            y ya manejan solas.
          </p>

          <div
            class="gallery-grid"
            id="gallery-grid"
          ></div>
        </div>
      </section>

      <section
        id="sec-resenas"
        class="hidden"
      >
        <div class="wrap">
          <div class="eyebrow">
            Reseñas
          </div>

          <h2 class="title">
            Lo que dicen las alumnas
          </h2>

          <div
            class="reviews-track"
            id="reviews-track"
          ></div>

          <div
            class="panel"
            style="
              margin-top:30px;
              max-width:520px;
            "
          >
            <h3>
              Dejá tu opinión
            </h3>

            <form
              onsubmit="
                return submitReview(event)
              "
            >
              <div class="field">
                <label>
                  Tu nombre
                </label>

                <input
                  required
                  id="rv-name"
                >
              </div>

              <div class="field">
                <label>
                  Puntaje
                </label>

                <select id="rv-rating">
                  <option value="5">
                    ★★★★★ Excelente
                  </option>

                  <option value="4">
                    ★★★★☆ Muy bueno
                  </option>

                  <option value="3">
                    ★★★☆☆ Bueno
                  </option>

                  <option value="2">
                    ★★☆☆☆ Regular
                  </option>

                  <option value="1">
                    ★☆☆☆☆ Malo
                  </option>
                </select>
              </div>

              <div class="field">
                <label>
                  Comentario
                </label>

                <textarea
                  required
                  id="rv-comment"
                  rows="3"
                ></textarea>
              </div>

              <button
                class="cta-btn"
                type="submit"
              >
                Enviar opinión
              </button>

              <div
                id="review-form-msg"
              ></div>
            </form>
          </div>
        </div>
      </section>

      <section
        id="sec-faq"
        class="hidden"
        style="
          background:var(--cream-dim);
        "
      >
        <div
          class="wrap"
          style="max-width:760px;"
        >
          <div class="eyebrow">
            Información útil
          </div>

          <h2 class="title">
            Preguntas frecuentes
          </h2>

          <div id="faq-list"></div>
        </div>
      </section>

      <section
        id="sec-contacto"
        class="hidden"
      >
        <div class="wrap">
          <div class="eyebrow">
            Contacto
          </div>

          <h2 class="title">
            Hablemos
          </h2>

          <div class="contact-grid">
            <div
              class="contact-links"
              id="contact-links"
            ></div>

            <div class="panel">
              <h3>
                Formulario de consultas
              </h3>

              <form
                onsubmit="
                  return submitContact(event)
                "
              >
                <div class="field">
                  <label>
                    Nombre
                  </label>

                  <input
                    required
                    id="ct-name"
                  >
                </div>

                <div class="field">
                  <label>
                    Teléfono o Instagram
                  </label>

                  <input
                    required
                    id="ct-contact"
                  >
                </div>

                <div class="field">
                  <label>
                    Consulta
                  </label>

                  <textarea
                    required
                    id="ct-message"
                    rows="4"
                  ></textarea>
                </div>

                <button
                  class="cta-btn"
                  type="submit"
                >
                  Enviar consulta
                </button>

                <div
                  id="contact-form-msg"
                ></div>
              </form>
            </div>
          </div>
        </div>
      </section>
    `;
}

function escapeHTML(value){
  return String(value ?? '')
    .replace(
      /[&<>"']/g,
      character=>({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character]
    );
}

/* ==================================================================
   ADMINISTRADOR: AUTENTICACIÓN
   ================================================================== */

async function currentSessionIsAdmin(){
  const {
    data: { session },
    error: sessionError
  } =
    await supabaseClient
      .auth
      .getSession();

  if(
    sessionError ||
    !session
  ){
    return false;
  }

  const {
    data,
    error
  } =
    await supabaseClient
      .from('admin_users')
      .select('user_id')
      .eq(
        'user_id',
        session.user.id
      )
      .maybeSingle();

  if(error){
    console.error(
      'No se pudo verificar el acceso administrativo:',
      error
    );

    return false;
  }

  return Boolean(data);
}

async function openAdmin(){
  document
    .getElementById(
      'public-view'
    )
    .classList
    .add('hidden');

  document
    .getElementById(
      'admin-view'
    )
    .classList
    .remove('hidden');

  try{
    adminAuthed =
      await currentSessionIsAdmin();

    if(adminAuthed){
      showAdminDashboard();
    }else{
      showAdminLogin();
    }
  }catch(error){
    console.error(
      'No se pudo abrir el panel:',
      error
    );

    adminAuthed = false;
    showAdminLogin();
  }
}

function closeAdmin(){
  document
    .getElementById(
      'admin-view'
    )
    .classList
    .add('hidden');

  document
    .getElementById(
      'public-view'
    )
    .classList
    .remove('hidden');
}

function showAdminLogin(){
  document
    .getElementById(
      'admin-login-screen'
    )
    .classList
    .remove('hidden');

  document
    .getElementById(
      'admin-dashboard-screen'
    )
    .classList
    .add('hidden');

  const errorBox =
    document.getElementById(
      'login-error'
    );

  if(errorBox){
    errorBox
      .classList
      .add('hidden');
  }
}

async function handleLogin(event){
  event.preventDefault();

  const emailInput =
    document.getElementById(
      'login-user'
    );

  const passwordInput =
    document.getElementById(
      'login-pass'
    );

  const errorBox =
    document.getElementById(
      'login-error'
    );

  const submitButton =
    event.target.querySelector(
      'button[type="submit"]'
    );

  const email =
    emailInput.value.trim();

  const password =
    passwordInput.value;

  errorBox
    .classList
    .add('hidden');

  try{
    submitButton.disabled = true;
    submitButton.textContent =
      'Ingresando…';

    const { error } =
      await supabaseClient
        .auth
        .signInWithPassword({
          email,
          password
        });

    if(error){
      throw error;
    }

    adminAuthed =
      await currentSessionIsAdmin();

    if(!adminAuthed){
      await supabaseClient
        .auth
        .signOut();

      throw new Error(
        'Este usuario no tiene permisos de administradora.'
      );
    }

    passwordInput.value = '';

    showAdminDashboard();
  }catch(error){
    console.error(
      'No se pudo iniciar sesión:',
      error
    );

    errorBox.textContent =
      error.message ===
      'Este usuario no tiene permisos de administradora.'
        ? error.message
        : 'Correo o contraseña incorrectos.';

    errorBox
      .classList
      .remove('hidden');

    adminAuthed = false;
  }finally{
    submitButton.disabled = false;
    submitButton.textContent =
      'Ingresar';
  }

  return false;
}

async function logoutAdmin(){
  await supabaseClient
    .auth
    .signOut();

  adminAuthed = false;

  document
    .getElementById(
      'admin-view'
    )
    .classList
    .add('hidden');

  document
    .getElementById(
      'public-view'
    )
    .classList
    .remove('hidden');

  showAdminLogin();
}

function showAdminDashboard(){
  document
    .getElementById(
      'admin-login-screen'
    )
    .classList
    .add('hidden');

  document
    .getElementById(
      'admin-dashboard-screen'
    )
    .classList
    .remove('hidden');

  renderAdminNav();
  goAdmin('dashboard');
}

/* ==================================================================
   ADMINISTRADOR: NAVEGACIÓN
   ================================================================== */

const ADMIN_TABS = [
  {
    id: 'dashboard',
    label: 'Panel de control'
  },
  {
    id: 'agenda',
    label: 'Agenda'
  },
  {
    id: 'alumnas',
    label: 'Fichas de alumnas'
  },
  {
    id: 'galeria',
    label: 'Galería de egresadas'
  },
  {
    id: 'resenas',
    label: 'Reseñas'
  },
  {
    id: 'precios',
    label: 'Precios y promos'
  },
  {
    id: 'mensajes',
    label: 'Mensajes'
  },
  {
    id: 'ajustes',
    label: 'Ajustes del sitio'
  }
];

let currentAdminTab =
  'dashboard';

function renderAdminNav(){
  document
    .getElementById(
      'admin-nav'
    )
    .innerHTML =
      ADMIN_TABS
        .map(tab=>`
          <button
            class="${
              tab.id ===
              currentAdminTab
                ? 'active'
                : ''
            }"
            onclick="
              goAdmin('${tab.id}')
            "
          >
            ${tab.label}
          </button>
        `)
        .join('');
}

async function goAdmin(id){
  currentAdminTab = id;
  renderAdminNav();

  const main =
    document.getElementById(
      'admin-main'
    );

  main.innerHTML = `
    <div class="empty">
      Cargando información…
    </div>
  `;

  try{
    if(!adminAuthed){
      throw new Error(
        'La sesión administrativa no está activa.'
      );
    }

    await loadAdminData();

    const functions = {
      dashboard:
        renderAdminDashboard,

      agenda:
        renderAdminAgenda,

      alumnas:
        renderAdminStudents,

      galeria:
        renderAdminGallery,

      resenas:
        renderAdminReviews,

      precios:
        renderAdminPricing,

      mensajes:
        renderAdminMessages,

      ajustes:
        renderAdminSettings
    };

    functions[id]();
  }catch(error){
    console.error(
      'No se pudo cargar el panel:',
      error
    );

    main.innerHTML = `
      <div class="error-box">
        No se pudo cargar la información
        del panel. Revisá la conexión e
        intentá nuevamente.
      </div>
    `;
  }
}

/* ==================================================================
   ADMINISTRADOR: DASHBOARD
   ================================================================== */

function renderAdminDashboard(){
  const today = todayISO();

  const inSevenDays =
    new Date();

  inSevenDays.setDate(
    inSevenDays.getDate() + 7
  );

  const inSevenDaysIso =
    toISO(inSevenDays);

  const confirmed =
    DB.bookings.filter(
      booking=>
        booking.status ===
        'confirmed'
    );

  const classesToday =
    confirmed.filter(
      booking=>
        booking.date === today
    ).length;

  const classesWeek =
    confirmed.filter(
      booking=>
        booking.date >= today &&
        booking.date <=
          inSevenDaysIso
    ).length;

  const pending =
    DB.bookings.filter(
      booking=>
        booking.status ===
        'pending'
    ).length;

  const thisMonth =
    today.slice(0, 7);

  const income =
    confirmed
      .filter(booking=>
        booking.date
          .slice(0, 7) ===
        thisMonth
      )
      .reduce(
        (total, booking)=>
          total +
          priceFor(
            booking.service
          ),
        0
      );

  const pendingReviews =
    DB.reviews.filter(
      review=>
        review.status ===
        'pending'
    ).length;

  const tomorrow =
    new Date();

  tomorrow.setDate(
    tomorrow.getDate() + 1
  );

  const tomorrowIso =
    toISO(tomorrow);

  const remindersList =
    confirmed.filter(
      booking=>
        booking.date ===
        tomorrowIso
    );

  document
    .getElementById(
      'admin-main'
    )
    .innerHTML = `
      <h2>
        Panel de control
      </h2>

      <p
        class="lede"
        style="margin-bottom:22px;"
      >
        Un vistazo rápido a cómo
        viene el negocio.
      </p>

      ${
        !DB.settings.whatsapp
          ? `
            <div class="demo-note">
              Todavía no cargaste tu
              número de WhatsApp real.
              Andá a
              <b>Ajustes del sitio</b>
              para cargarlo.
            </div>
          `
          : ''
      }

      <div class="stat-grid">
        <div class="stat-card">
          <div class="num">
            ${classesToday}
          </div>

          <div class="lbl">
            Clases hoy
          </div>
        </div>

        <div class="stat-card">
          <div class="num">
            ${classesWeek}
          </div>

          <div class="lbl">
            Clases esta semana
          </div>
        </div>

        <div class="stat-card">
          <div class="num">
            ${pending}
          </div>

          <div class="lbl">
            Solicitudes pendientes
          </div>
        </div>

        <div class="stat-card">
          <div class="num">
            ${fmtMoney(income)}
          </div>

          <div class="lbl">
            Ingresos estimados del mes
          </div>
        </div>
      </div>

      <div class="panel">
        <h3>
          Recordatorios —
          clases de mañana
          (${fmtDateHuman(
            tomorrowIso
          )})
        </h3>

        ${
          remindersList.length
            ? `
              <div class="table-scroll">
                <table class="admin-table">
                  <tr>
                    <th>Alumna</th>
                    <th>Hora</th>
                    <th>Servicio</th>
                    <th></th>
                  </tr>

                  ${
                    remindersList
                      .map(booking=>`
                        <tr>
                          <td>
                            ${
                              escapeHTML(
                                booking.name
                              )
                            }
                          </td>

                          <td class="mono">
                            ${booking.time}
                          </td>

                          <td>
                            ${
                              labelFor(
                                booking.service
                              )
                            }
                          </td>

                          <td>
                            <a
                              class="mini-btn wa"
                              target="_blank"
                              rel="noopener noreferrer"
                              href="${
                                waLink(
                                  booking.phone,
                                  (
                                    'Hola ' +
                                    booking.name +
                                    '! Te recordamos tu clase de manejo mañana ' +
                                    fmtDateHuman(
                                      booking.date
                                    ) +
                                    ' a las ' +
                                    booking.time +
                                    '. ¡Te esperamos!'
                                  )
                                )
                              }"
                            >
                              Enviar recordatorio
                              por WhatsApp
                            </a>
                          </td>
                        </tr>
                      `)
                      .join('')
                  }
                </table>
              </div>
            `
            : `
              <div class="empty">
                No hay clases confirmadas
                para mañana.
              </div>
            `
        }

        <p class="note">
          El recordatorio abre WhatsApp
          con el mensaje preparado.
        </p>
      </div>

      <div class="panel">
        <h3>
          Otros pendientes
        </h3>

        <p style="margin:0;">
          📝
          ${pendingReviews}
          reseña${
            pendingReviews === 1
              ? ''
              : 's'
          }
          esperando moderación

          · 💬

          ${
            DB.messages.filter(
              message=>!message.read
            ).length
          }

          mensaje${
            DB.messages.filter(
              message=>!message.read
            ).length === 1
              ? ''
              : 's'
          }
          nuevo${
            DB.messages.filter(
              message=>!message.read
            ).length === 1
              ? ''
              : 's'
          }
        </p>
      </div>
    `;
}

function priceFor(serviceKey){
  if(serviceKey === 'suelta'){
    return DB.services.suelta.price;
  }

  if(serviceKey === 'curso'){
    return DB.services.curso.price;
  }

  const pack =
    DB.services.packs.find(
      item=>item.id === serviceKey
    );

  return pack
    ? pack.price
    : 0;
}

function labelFor(serviceKey){
  if(serviceKey === 'suelta'){
    return SERVICE_LABELS.suelta;
  }

  if(serviceKey === 'curso'){
    return SERVICE_LABELS.curso;
  }

  const pack =
    DB.services.packs.find(
      item=>item.id === serviceKey
    );

  return pack
    ? pack.name
    : serviceKey;
}

/* ==================================================================
   ADMINISTRADOR: AGENDA
   ================================================================== */

let adminMonthOffset = 0;
let adminSelectedDate = null;

function renderAdminAgenda(){
  document
    .getElementById(
      'admin-main'
    )
    .innerHTML = `
      <h2>
        Gestión de agenda
      </h2>

      <p
        class="lede"
        style="margin-bottom:22px;"
      >
        Creá turnos, bloqueá días
        y confirmá o cancelá
        solicitudes.
      </p>

      <div class="booking-grid">
        <div
          class="cal"
          id="cal-admin"
        ></div>

        <div
          class="slot-panel"
          id="admin-day-panel"
        ></div>
      </div>
    `;

  drawAdminCalendar();
}

function drawAdminCalendar(){
  buildCalendar(
    'cal-admin',
    adminMonthOffset,
    {
      onNav: delta=>{
        adminMonthOffset += delta;
        drawAdminCalendar();
      },

      onPick: iso=>{
        adminSelectedDate = iso;
        renderAdminDayPanel();
        drawAdminCalendar();
      },

      selected:
        adminSelectedDate,

      mode:
        'admin'
    }
  );

  renderAdminDayPanel();
}

function renderAdminDayPanel(){
  const panel =
    document.getElementById(
      'admin-day-panel'
    );

  if(!adminSelectedDate){
    panel.innerHTML = `
      <h3>
        Elegí un día
      </h3>

      <p class="note">
        Tocá una fecha en el calendario
        para administrarla.
      </p>
    `;

    return;
  }

  const iso =
    adminSelectedDate;

  const blocked =
    Boolean(
      DB.schedule.blocked[iso]
    );

  const slots =
    DB.schedule
      .availability[iso] || [];

  const bookingsDay =
    DB.bookings.filter(
      booking=>
        booking.date === iso &&
        booking.status !==
          'cancelled'
    );

  panel.innerHTML = `
    <h3>
      ${fmtDateHuman(iso)}
    </h3>

    <label
      style="
        display:flex;
        align-items:center;
        gap:8px;
        margin-bottom:14px;
        font-size:14px;
      "
    >
      <input
        type="checkbox"
        ${blocked ? 'checked' : ''}
        onchange="
          toggleBlockDay(
            '${iso}',
            this.checked
          )
        "
      >

      No atiendo este día
      (bloquear)
    </label>

    ${
      !blocked
        ? `
          <p
            style="
              font-size:13px;
              color:var(--ink-soft);
              margin-bottom:6px;
            "
          >
            Horarios disponibles:
          </p>

          <div class="slot-list">
            ${
              slots.length
                ? slots
                    .map(time=>{
                      const isBooked =
                        bookingsDay.some(
                          booking=>
                            booking.time ===
                            time
                        );

                      return `
                        <span
                          class="
                            slot-btn
                            ${
                              isBooked
                                ? 'picked'
                                : ''
                            }
                          "
                          style="
                            display:inline-flex;
                            align-items:center;
                            gap:6px;
                          "
                        >
                          ${time}

                          ${
                            !isBooked
                              ? `
                                <button
                                  class="tag-del"
                                  onclick="
                                    removeSlot(
                                      '${iso}',
                                      '${time}'
                                    )
                                  "
                                  title="Quitar"
                                >
                                  ✕
                                </button>
                              `
                              : ''
                          }
                        </span>
                      `;
                    })
                    .join('')
                : `
                  <span class="note">
                    Sin horarios cargados.
                  </span>
                `
            }
          </div>

          <div
            class="inline-form"
            style="margin-bottom:20px;"
          >
            <div class="f">
              <label>
                Agregar horario
              </label>

              <input
                type="time"
                id="new-slot-time"
              >
            </div>

            <button
              class="mini-btn"
              onclick="addSlot('${iso}')"
            >
              Agregar
            </button>
          </div>
        `
        : ''
    }

    <h3 style="font-size:16px;">
      Solicitudes y clases este día
    </h3>

    ${
      bookingsDay.length
        ? `
          <div class="table-scroll">
            <table class="admin-table">
              <tr>
                <th>Hora</th>
                <th>Alumna</th>
                <th>Servicio</th>
                <th>Estado</th>
                <th></th>
              </tr>

              ${
                bookingsDay
                  .map(booking=>`
                    <tr>
                      <td class="mono">
                        ${booking.time}
                      </td>

                      <td>
                        ${
                          escapeHTML(
                            booking.name
                          )
                        }

                        <br>

                        <span class="note">
                          ${
                            escapeHTML(
                              booking.phone
                            )
                          }
                        </span>
                      </td>

                      <td>
                        ${
                          labelFor(
                            booking.service
                          )
                        }
                      </td>

                      <td>
                        <span
                          class="
                            pill
                            ${booking.status}
                          "
                        >
                          ${
                            booking.status ===
                            'pending'
                              ? 'Pendiente'
                              : booking.status ===
                                'confirmed'
                                ? 'Confirmada'
                                : 'Cancelada'
                          }
                        </span>
                      </td>

                      <td class="btnrow">
                        ${
                          booking.status ===
                          'pending'
                            ? `
                              <button
                                class="mini-btn ok"
                                onclick="
                                  setBookingStatus(
                                    '${booking.id}',
                                    'confirmed'
                                  )
                                "
                              >
                                Confirmar
                              </button>
                            `
                            : ''
                        }

                        ${
                          booking.status !==
                          'cancelled'
                            ? `
                              <button
                                class="mini-btn no"
                                onclick="
                                  setBookingStatus(
                                    '${booking.id}',
                                    'cancelled'
                                  )
                                "
                              >
                                Cancelar
                              </button>
                            `
                            : ''
                        }

                        <a
                          class="mini-btn wa"
                          target="_blank"
                          rel="noopener noreferrer"
                          href="${
                            waLink(
                              booking.phone,
                              (
                                'Hola ' +
                                booking.name +
                                '! Te escribimos por tu clase de manejo del ' +
                                fmtDateHuman(
                                  booking.date
                                ) +
                                ' a las ' +
                                booking.time +
                                '.'
                              )
                            )
                          }"
                        >
                          WhatsApp
                        </a>
                      </td>
                    </tr>
                  `)
                  .join('')
              }
            </table>
          </div>
        `
        : `
          <div class="empty">
            No hay turnos solicitados
            para este día.
          </div>
        `
    }
  `;
}

async function toggleBlockDay(
  iso,
  value
){
  try{
    let result;

    if(value){
      result =
        await supabaseClient
          .from('blocked_days')
          .upsert({
            class_date: iso,
            reason: ''
          });
    }else{
      result =
        await supabaseClient
          .from('blocked_days')
          .delete()
          .eq(
            'class_date',
            iso
          );
    }

    if(result.error){
      throw result.error;
    }

    await loadAdminData();
    drawAdminCalendar();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo actualizar el bloqueo del día.'
    );
  }
}

async function addSlot(iso){
  const input =
    document.getElementById(
      'new-slot-time'
    );

  const time =
    input.value;

  if(!time){
    return;
  }

  try{
    const { error } =
      await supabaseClient
        .from('availability')
        .insert({
          class_date: iso,
          class_time: time
        });

    if(
      error &&
      error.code !== '23505'
    ){
      throw error;
    }

    input.value = '';

    await loadAdminData();
    drawAdminCalendar();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo agregar el horario.'
    );
  }
}

async function removeSlot(
  iso,
  time
){
  try{
    const { error } =
      await supabaseClient
        .from('availability')
        .delete()
        .eq(
          'class_date',
          iso
        )
        .eq(
          'class_time',
          time
        );

    if(error){
      throw error;
    }

    await loadAdminData();
    drawAdminCalendar();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo eliminar el horario.'
    );
  }
}

async function setBookingStatus(
  id,
  status
){
  try{
    const { error } =
      await supabaseClient
        .from('bookings')
        .update({
          status,
          updated_at:
            new Date().toISOString()
        })
        .eq('id', id);

    if(error){
      throw error;
    }

    await loadAdminData();
    renderAdminDayPanel();
    drawAdminCalendar();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo actualizar el estado de la reserva.'
    );
  }
}

/* ==================================================================
   ADMINISTRADOR: ALUMNAS
   ================================================================== */

function renderAdminStudents(){
  document
    .getElementById(
      'admin-main'
    )
    .innerHTML = `
      <h2>
        Fichas de alumnas
      </h2>

      <p
        class="lede"
        style="margin-bottom:22px;"
      >
        Datos de contacto, clases
        tomadas y progreso de cada
        alumna.
      </p>

      <div class="panel">
        <h3>
          Agregar alumna
        </h3>

        <div class="inline-form">
          <div class="f">
            <label>
              Nombre
            </label>

            <input id="st-name">
          </div>

          <div class="f">
            <label>
              Teléfono
            </label>

            <input id="st-phone">
          </div>

          <div class="f">
            <label>
              Clases tomadas
            </label>

            <input
              id="st-classes"
              type="number"
              min="0"
              value="0"
              style="width:90px;"
            >
          </div>

          <div class="f">
            <label>
              Progreso
            </label>

            <input
              id="st-progress"
              placeholder="Ej: recién empieza"
            >
          </div>

          <button
            class="mini-btn"
            onclick="addStudent()"
          >
            Agregar
          </button>
        </div>
      </div>

      <div class="table-scroll">
        <table class="admin-table">
          <tr>
            <th>Nombre</th>
            <th>Teléfono</th>
            <th>Clases tomadas</th>
            <th>Progreso</th>
            <th></th>
          </tr>

          ${
            DB.students.length
              ? DB.students
                  .map(student=>`
                    <tr>
                      <td>
                        ${
                          escapeHTML(
                            student.name
                          )
                        }
                      </td>

                      <td>
                        ${
                          escapeHTML(
                            student.phone
                          )
                        }
                      </td>

                      <td class="mono">
                        ${
                          student.classesTaken
                        }
                      </td>

                      <td
                        style="
                          max-width:260px;
                        "
                      >
                        ${
                          escapeHTML(
                            student.progress
                          )
                        }
                      </td>

                      <td class="btnrow">
                        <button
                          class="mini-btn ok"
                          onclick="
                            bumpClasses(
                              '${student.id}'
                            )
                          "
                        >
                          +1 clase
                        </button>

                        <button
                          class="mini-btn no"
                          onclick="
                            removeStudent(
                              '${student.id}'
                            )
                          "
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  `)
                  .join('')
              : `
                <tr>
                  <td colspan="5">
                    <div class="empty">
                      Todavía no cargaste
                      alumnas.
                    </div>
                  </td>
                </tr>
              `
          }
        </table>
      </div>
    `;
}

async function addStudent(){
  const name =
    document
      .getElementById(
        'st-name'
      )
      .value
      .trim();

  if(!name){
    return;
  }

  try{
    const { error } =
      await supabaseClient
        .from('students')
        .insert({
          name,

          phone:
            document
              .getElementById(
                'st-phone'
              )
              .value
              .trim(),

          classes_taken:
            Number(
              document
                .getElementById(
                  'st-classes'
                )
                .value
            ) || 0,

          progress:
            document
              .getElementById(
                'st-progress'
              )
              .value
              .trim()
        });

    if(error){
      throw error;
    }

    await loadAdminData();
    renderAdminStudents();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo agregar la alumna.'
    );
  }
}

async function bumpClasses(id){
  const student =
    DB.students.find(
      item=>item.id === id
    );

  if(!student){
    return;
  }

  try{
    const { error } =
      await supabaseClient
        .from('students')
        .update({
          classes_taken:
            student.classesTaken + 1,

          updated_at:
            new Date().toISOString()
        })
        .eq('id', id);

    if(error){
      throw error;
    }

    await loadAdminData();
    renderAdminStudents();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo actualizar la cantidad de clases.'
    );
  }
}

async function removeStudent(id){
  if(
    !confirm(
      '¿Querés eliminar esta ficha de alumna?'
    )
  ){
    return;
  }

  try{
    const { error } =
      await supabaseClient
        .from('students')
        .delete()
        .eq('id', id);

    if(error){
      throw error;
    }

    await loadAdminData();
    renderAdminStudents();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo eliminar la alumna.'
    );
  }
}

/* ==================================================================
   ADMINISTRADOR: GALERÍA
   ================================================================== */

function renderAdminGallery(){
  const photos =
    (DB.gallery || [])
      .slice()
      .reverse();

  document
    .getElementById(
      'admin-main'
    )
    .innerHTML = `
      <h2>
        Galería de egresadas
      </h2>

      <p
        class="lede"
        style="margin-bottom:22px;"
      >
        Subí fotos de alumnas que ya
        terminaron el curso.
        La descripción es opcional.
      </p>

      <div class="panel">
        <h3>
          Subir foto
        </h3>

        <form
          onsubmit="
            return addGalleryPhoto(event)
          "
        >
          <div class="field">
            <label>
              Foto
            </label>

            <input
              type="file"
              id="gal-file"
              accept="image/*"
              required
            >
          </div>

          <div class="field">
            <label>
              Nombre de la alumna
            </label>

            <input
              id="gal-name"
              placeholder="Ej: Sofía M."
            >
          </div>

          <div class="field">
            <label>
              Descripción (opcional)
            </label>

            <input
              id="gal-desc"
              placeholder="Ej: ¡Ya se sacó su primera licencia!"
            >
          </div>

          <button
            class="cta-btn"
            type="submit"
          >
            Subir foto
          </button>

          <div id="gal-msg"></div>
        </form>

        <p class="note">
          Las fotos se comprimen
          automáticamente y se guardan
          en Supabase Storage.
        </p>
      </div>

      <div class="admin-gallery-grid">
        ${
          photos.length
            ? photos
                .map(photo=>`
                  <div class="admin-gphoto">
                    <button
                      class="del-photo"
                      title="Eliminar"
                      onclick="
                        removeGalleryPhoto(
                          '${photo.id}'
                        )
                      "
                    >
                      ✕
                    </button>

                    <img
                      src="${photo.image}"
                      alt=""
                    >

                    <div class="gcap">
                      <b>
                        ${
                          escapeHTML(
                            photo.name ||
                            'Sin nombre'
                          )
                        }
                      </b>

                      ${
                        photo.desc
                          ? `
                            <br>
                            ${
                              escapeHTML(
                                photo.desc
                              )
                            }
                          `
                          : ''
                      }
                    </div>
                  </div>
                `)
                .join('')
            : `
              <div
                class="empty"
                style="grid-column:1/-1;"
              >
                Todavía no subiste
                ninguna foto.
              </div>
            `
        }
      </div>
    `;
}

function resizeImageFile(
  file,
  maxSize = 900,
  quality = 0.78
){
  return new Promise(
    (resolve, reject)=>{
      const reader =
        new FileReader();

      reader.onerror = ()=>{
        reject(
          new Error(
            'No se pudo leer el archivo.'
          )
        );
      };

      reader.onload = ()=>{
        const image =
          new Image();

        image.onerror = ()=>{
          reject(
            new Error(
              'No se pudo procesar la imagen.'
            )
          );
        };

        image.onload = ()=>{
          let width =
            image.width;

          let height =
            image.height;

          if(
            width > height &&
            width > maxSize
          ){
            height =
              Math.round(
                height *
                maxSize /
                width
              );

            width = maxSize;
          }else if(
            height > maxSize
          ){
            width =
              Math.round(
                width *
                maxSize /
                height
              );

            height = maxSize;
          }

          const canvas =
            document.createElement(
              'canvas'
            );

          canvas.width = width;
          canvas.height = height;

          const context =
            canvas.getContext('2d');

          context.drawImage(
            image,
            0,
            0,
            width,
            height
          );

          canvas.toBlob(
            blob=>{
              if(blob){
                resolve(blob);
              }else{
                reject(
                  new Error(
                    'No se pudo comprimir la imagen.'
                  )
                );
              }
            },
            'image/jpeg',
            quality
          );
        };

        image.src =
          reader.result;
      };

      reader.readAsDataURL(file);
    }
  );
}

async function addGalleryPhoto(event){
  event.preventDefault();

  const fileInput =
    document.getElementById(
      'gal-file'
    );

  const messageBox =
    document.getElementById(
      'gal-msg'
    );

  const submitButton =
    event.target.querySelector(
      'button[type="submit"]'
    );

  const file =
    fileInput.files[0];

  if(!file){
    return false;
  }

  let storagePath = '';

  try{
    submitButton.disabled = true;
    submitButton.textContent =
      'Subiendo…';

    messageBox.innerHTML = `
      <p class="note">
        Procesando imagen…
      </p>
    `;

    const {
      data: { user },
      error: userError
    } =
      await supabaseClient
        .auth
        .getUser();

    if(
      userError ||
      !user
    ){
      throw new Error(
        'La sesión administrativa venció.'
      );
    }

    const imageBlob =
      await resizeImageFile(file);

    const safeName =
      file.name
        .replace(
          /\.[^/.]+$/,
          ''
        )
        .replace(
          /[^a-zA-Z0-9_-]/g,
          '-'
        )
        .slice(0, 60);

    storagePath =
      user.id +
      '/' +
      Date.now() +
      '-' +
      (
        safeName ||
        'egresada'
      ) +
      '.jpg';

    const {
      error: uploadError
    } =
      await supabaseClient
        .storage
        .from('gallery')
        .upload(
          storagePath,
          imageBlob,
          {
            contentType:
              'image/jpeg',

            cacheControl:
              '3600',

            upsert:
              false
          }
        );

    if(uploadError){
      throw uploadError;
    }

    const {
      data: publicUrlData
    } =
      supabaseClient
        .storage
        .from('gallery')
        .getPublicUrl(
          storagePath
        );

    const {
      error: insertError
    } =
      await supabaseClient
        .from('gallery')
        .insert({
          name:
            document
              .getElementById(
                'gal-name'
              )
              .value
              .trim(),

          description:
            document
              .getElementById(
                'gal-desc'
              )
              .value
              .trim(),

          image_url:
            publicUrlData.publicUrl,

          storage_path:
            storagePath,

          visible:
            true
        });

    if(insertError){
      await supabaseClient
        .storage
        .from('gallery')
        .remove([
          storagePath
        ]);

      throw insertError;
    }

    await loadAdminData();
    renderAdminGallery();
  }catch(error){
    console.error(
      'No se pudo subir la foto:',
      error
    );

    messageBox.innerHTML = `
      <div class="error-box">
        No se pudo subir la foto.
        Verificá que el bucket
        "gallery" esté creado y que
        la imagen no sea demasiado
        pesada.
      </div>
    `;
  }finally{
    submitButton.disabled = false;
    submitButton.textContent =
      'Subir foto';
  }

  return false;
}

async function removeGalleryPhoto(id){
  const photo =
    DB.gallery.find(
      item=>item.id === id
    );

  if(!photo){
    return;
  }

  if(
    !confirm(
      '¿Querés eliminar esta foto de la galería?'
    )
  ){
    return;
  }

  try{
    if(photo.storagePath){
      const {
        error: storageError
      } =
        await supabaseClient
          .storage
          .from('gallery')
          .remove([
            photo.storagePath
          ]);

      if(storageError){
        throw storageError;
      }
    }

    const { error } =
      await supabaseClient
        .from('gallery')
        .delete()
        .eq('id', id);

    if(error){
      throw error;
    }

    await loadAdminData();
    renderAdminGallery();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo eliminar la foto.'
    );
  }
}

/* ==================================================================
   ADMINISTRADOR: RESEÑAS
   ================================================================== */

function renderAdminReviews(){
  document
    .getElementById(
      'admin-main'
    )
    .innerHTML = `
      <h2>
        Moderación de reseñas
      </h2>

      <p
        class="lede"
        style="margin-bottom:22px;"
      >
        Aprobá, rechazá o respondé
        las opiniones que dejan las
        clientas.
      </p>

      <div class="table-scroll">
        <table class="admin-table">
          <tr>
            <th>Nombre</th>
            <th>Puntaje</th>
            <th>Comentario</th>
            <th>Estado</th>
            <th>Respuesta</th>
            <th></th>
          </tr>

          ${
            DB.reviews.length
              ? DB.reviews
                  .map(review=>`
                    <tr>
                      <td>
                        ${
                          escapeHTML(
                            review.name
                          )
                        }
                      </td>

                      <td class="mono">
                        ${'★'.repeat(
                          review.rating
                        )}
                      </td>

                      <td
                        style="
                          max-width:260px;
                        "
                      >
                        ${
                          escapeHTML(
                            review.comment
                          )
                        }
                      </td>

                      <td>
                        <span
                          class="
                            pill
                            ${
                              review.status ===
                              'approved'
                                ? 'confirmed'
                                : review.status ===
                                  'rejected'
                                  ? 'cancelled'
                                  : 'pending'
                            }
                          "
                        >
                          ${
                            review.status ===
                            'approved'
                              ? 'Aprobada'
                              : review.status ===
                                'rejected'
                                ? 'Rechazada'
                                : 'Pendiente'
                          }
                        </span>
                      </td>

                      <td
                        style="
                          min-width:180px;
                        "
                      >
                        <textarea
                          id="reply-${review.id}"
                          rows="2"
                          style="
                            width:100%;
                            font-size:13px;
                            padding:6px;
                            border:1px solid var(--line);
                            border-radius:6px;
                          "
                        >${
                          escapeHTML(
                            review.reply || ''
                          )
                        }</textarea>

                        <button
                          class="mini-btn"
                          style="margin-top:4px;"
                          onclick="
                            saveReply(
                              '${review.id}'
                            )
                          "
                        >
                          Guardar respuesta
                        </button>
                      </td>

                      <td class="btnrow">
                        <button
                          class="mini-btn ok"
                          onclick="
                            setReviewStatus(
                              '${review.id}',
                              'approved'
                            )
                          "
                        >
                          Aprobar
                        </button>

                        <button
                          class="mini-btn no"
                          onclick="
                            setReviewStatus(
                              '${review.id}',
                              'rejected'
                            )
                          "
                        >
                          Rechazar
                        </button>
                      </td>
                    </tr>
                  `)
                  .join('')
              : `
                <tr>
                  <td colspan="6">
                    <div class="empty">
                      No hay reseñas todavía.
                    </div>
                  </td>
                </tr>
              `
          }
        </table>
      </div>
    `;
}

async function setReviewStatus(
  id,
  status
){
  try{
    const { error } =
      await supabaseClient
        .from('reviews')
        .update({ status })
        .eq('id', id);

    if(error){
      throw error;
    }

    await loadAdminData();
    renderAdminReviews();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo actualizar la reseña.'
    );
  }
}

async function saveReply(id){
  const reply =
    document
      .getElementById(
        'reply-' + id
      )
      .value
      .trim();

  try{
    const { error } =
      await supabaseClient
        .from('reviews')
        .update({ reply })
        .eq('id', id);

    if(error){
      throw error;
    }

    await loadAdminData();
    renderAdminReviews();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo guardar la respuesta.'
    );
  }
}

/* ==================================================================
   ADMINISTRADOR: PRECIOS Y PROMOCIONES
   ================================================================== */

function renderAdminPricing(){
  const services = DB.services;

  document
    .getElementById(
      'admin-main'
    )
    .innerHTML = `
      <h2>
        Precios y promociones
      </h2>

      <p
        class="lede"
        style="margin-bottom:22px;"
      >
        Actualizá tus precios y activá
        o quitá promociones cuando
        quieras.
      </p>

      <div class="panel">
        <h3>
          Clase suelta
        </h3>

        <div class="inline-form">
          <div class="f">
            <label>Precio</label>

            <input
              type="number"
              id="price-suelta"
              value="${
                services.suelta.price
              }"
              style="width:140px;"
            >
          </div>

          <div
            class="f"
            style="
              flex:1;
              min-width:220px;
            "
          >
            <label>
              Descripción
            </label>

            <input
              id="desc-suelta"
              value="${
                escapeHTML(
                  services.suelta.desc
                )
              }"
            >
          </div>

          <button
            class="mini-btn"
            onclick="
              saveServiceSuelta()
            "
          >
            Guardar
          </button>
        </div>
      </div>

      <div class="panel">
        <h3>
          Curso integral -
          Mi Primera Licencia
        </h3>

        <div class="inline-form">
          <div class="f">
            <label>
              Precio
            </label>

            <input
              type="number"
              id="price-curso"
              value="${
                services.curso.price
              }"
              style="width:140px;"
            >
          </div>

          <div
            class="f"
            style="
              flex:1;
              min-width:220px;
            "
          >
            <label>
              Descripción
            </label>

            <input
              id="desc-curso"
              value="${
                escapeHTML(
                  services.curso.desc
                )
              }"
            >
          </div>

          <button
            class="mini-btn"
            onclick="
              saveServiceCurso()
            "
          >
            Guardar
          </button>
        </div>
      </div>

      <div class="panel">
        <h3>
          Packs de clases
        </h3>

        <div class="table-scroll">
          <table class="admin-table">
            <tr>
              <th>Nombre</th>
              <th>Cant. clases</th>
              <th>Precio</th>
              <th></th>
            </tr>

            ${
              services.packs
                .map(pack=>`
                  <tr>
                    <td>
                      <input
                        id="
                          pack-name-${pack.id}
                        "
                        value="${
                          escapeHTML(
                            pack.name
                          )
                        }"
                        style="width:100%;"
                      >
                    </td>

                    <td>
                      <input
                        type="number"
                        id="
                          pack-classes-${pack.id}
                        "
                        value="${pack.classes}"
                        style="width:70px;"
                      >
                    </td>

                    <td>
                      <input
                        type="number"
                        id="
                          pack-price-${pack.id}
                        "
                        value="${pack.price}"
                        style="width:110px;"
                      >
                    </td>

                    <td class="btnrow">
                      <button
                        class="mini-btn"
                        onclick="
                          savePack(
                            '${pack.id}'
                          )
                        "
                      >
                        Guardar
                      </button>

                      <button
                        class="mini-btn no"
                        onclick="
                          removePack(
                            '${pack.id}'
                          )
                        "
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                `)
                .join('')
            }
          </table>
        </div>

        <div
          class="inline-form"
          style="margin-top:14px;"
        >
          <div class="f">
            <label>
              Nombre
            </label>

            <input
              id="new-pack-name"
              placeholder="Pack 8 clases"
            >
          </div>

          <div class="f">
            <label>
              Cant. clases
            </label>

            <input
              type="number"
              id="new-pack-classes"
              style="width:80px;"
            >
          </div>

          <div class="f">
            <label>
              Precio
            </label>

            <input
              type="number"
              id="new-pack-price"
              style="width:110px;"
            >
          </div>

          <button
            class="mini-btn"
            onclick="addPack()"
          >
            Agregar pack
          </button>
        </div>
      </div>

      <div class="panel">
        <h3>
          Promociones
        </h3>

        ${
          DB.promos.length
            ? DB.promos
                .map(promo=>`
                  <div
                    class="promo-card"
                    style="
                      background:
                        ${
                          promo.active
                            ? 'linear-gradient(135deg,var(--amber),var(--amber-dk))'
                            : 'var(--cream-dim)'
                        };
                      color:
                        ${
                          promo.active
                            ? 'var(--asphalt)'
                            : 'var(--ink-soft)'
                        };
                    "
                  >
                    <div>
                      <h4>
                        ${
                          escapeHTML(
                            promo.title
                          )
                        }
                      </h4>

                      <p>
                        ${
                          escapeHTML(
                            promo.desc
                          )
                        }
                      </p>
                    </div>

                    <div class="btnrow">
                      <button
                        class="mini-btn"
                        onclick="
                          togglePromo(
                            '${promo.id}'
                          )
                        "
                      >
                        ${
                          promo.active
                            ? 'Ocultar'
                            : 'Activar'
                        }
                      </button>

                      <button
                        class="mini-btn no"
                        onclick="
                          removePromo(
                            '${promo.id}'
                          )
                        "
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                `)
                .join('')
            : `
              <div class="empty">
                No hay promociones cargadas.
              </div>
            `
        }

        <h4 style="margin-top:20px;">
          Nueva promo
        </h4>

        <div class="field">
          <label>
            Título
          </label>

          <input id="new-promo-title">
        </div>

        <div class="field">
          <label>
            Descripción
          </label>

          <input id="new-promo-desc">
        </div>

        <div class="field">
          <label>
            Etiqueta (opcional)
          </label>

          <input
            id="new-promo-badge"
            placeholder="
              Ej: válido hasta fin de mes
            "
          >
        </div>

        <button
          class="cta-btn small"
          onclick="addPromo()"
        >
          Agregar promo
        </button>
      </div>
    `;
}

async function saveServiceSuelta(){
  try{
    const { error } =
      await supabaseClient
        .from('services')
        .update({
          price:
            Number(
              document
                .getElementById(
                  'price-suelta'
                )
                .value
            ) || 0,

          description:
            document
              .getElementById(
                'desc-suelta'
              )
              .value
              .trim()
        })
        .eq('id', 'suelta');

    if(error){
      throw error;
    }

    await loadAdminData();
    renderAdminPricing();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo guardar la clase suelta.'
    );
  }
}

async function saveServiceCurso(){
  try{
    const { error } =
      await supabaseClient
        .from('services')
        .update({
          price:
            Number(
              document
                .getElementById(
                  'price-curso'
                )
                .value
            ) || 0,

          description:
            document
              .getElementById(
                'desc-curso'
              )
              .value
              .trim()
        })
        .eq('id', 'curso');

    if(error){
      throw error;
    }

    await loadAdminData();
    renderAdminPricing();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo guardar el curso.'
    );
  }
}

async function savePack(id){
  try{
    const { error } =
      await supabaseClient
        .from('services')
        .update({
          name:
            document
              .getElementById(
                'pack-name-' + id
              )
              .value
              .trim(),

          classes:
            Number(
              document
                .getElementById(
                  'pack-classes-' + id
                )
                .value
            ) || 0,

          price:
            Number(
              document
                .getElementById(
                  'pack-price-' + id
                )
                .value
            ) || 0
        })
        .eq('id', id);

    if(error){
      throw error;
    }

    await loadAdminData();
    renderAdminPricing();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo guardar el pack.'
    );
  }
}

async function removePack(id){
  if(
    !confirm(
      '¿Querés eliminar este pack?'
    )
  ){
    return;
  }

  try{
    const { error } =
      await supabaseClient
        .from('services')
        .delete()
        .eq('id', id);

    if(error){
      throw error;
    }

    await loadAdminData();
    renderAdminPricing();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo eliminar el pack.'
    );
  }
}

async function addPack(){
  const name =
    document
      .getElementById(
        'new-pack-name'
      )
      .value
      .trim();

  if(!name){
    return;
  }

  try{
    const { error } =
      await supabaseClient
        .from('services')
        .insert({
          id: uid('pack'),
          name,
          service_type: 'pack',

          classes:
            Number(
              document
                .getElementById(
                  'new-pack-classes'
                )
                .value
            ) || 0,

          price:
            Number(
              document
                .getElementById(
                  'new-pack-price'
                )
                .value
            ) || 0,

          description:
            'Pack de clases de manejo.',

          active:
            true
        });

    if(error){
      throw error;
    }

    await loadAdminData();
    renderAdminPricing();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo agregar el pack.'
    );
  }
}

async function togglePromo(id){
  const promo =
    DB.promos.find(
      item=>item.id === id
    );

  if(!promo){
    return;
  }

  try{
    const { error } =
      await supabaseClient
        .from('promos')
        .update({
          active:
            !promo.active
        })
        .eq('id', id);

    if(error){
      throw error;
    }

    await loadAdminData();
    renderAdminPricing();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo actualizar la promoción.'
    );
  }
}

async function removePromo(id){
  if(
    !confirm(
      '¿Querés eliminar esta promoción?'
    )
  ){
    return;
  }

  try{
    const { error } =
      await supabaseClient
        .from('promos')
        .delete()
        .eq('id', id);

    if(error){
      throw error;
    }

    await loadAdminData();
    renderAdminPricing();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo eliminar la promoción.'
    );
  }
}

async function addPromo(){
  const title =
    document
      .getElementById(
        'new-promo-title'
      )
      .value
      .trim();

  if(!title){
    return;
  }

  try{
    const { error } =
      await supabaseClient
        .from('promos')
        .insert({
          title,

          description:
            document
              .getElementById(
                'new-promo-desc'
              )
              .value
              .trim(),

          badge:
            document
              .getElementById(
                'new-promo-badge'
              )
              .value
              .trim(),

          active:
            true
        });

    if(error){
      throw error;
    }

    await loadAdminData();
    renderAdminPricing();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo agregar la promoción.'
    );
  }
}

/* ==================================================================
   ADMINISTRADOR: MENSAJES
   ================================================================== */

function renderAdminMessages(){
  document
    .getElementById(
      'admin-main'
    )
    .innerHTML = `
      <h2>
        Mensajes de contacto
      </h2>

      <p
        class="lede"
        style="margin-bottom:22px;"
      >
        Consultas enviadas desde el
        formulario de contacto del sitio.
      </p>

      <div class="table-scroll">
        <table class="admin-table">
          <tr>
            <th>Fecha</th>
            <th>Nombre</th>
            <th>Contacto</th>
            <th>Mensaje</th>
            <th></th>
          </tr>

          ${
            DB.messages.length
              ? DB.messages
                  .slice()
                  .reverse()
                  .map(message=>`
                    <tr>
                      <td class="mono">
                        ${
                          new Date(
                            message.date
                          )
                            .toLocaleDateString(
                              'es-AR'
                            )
                        }
                      </td>

                      <td>
                        ${
                          escapeHTML(
                            message.name
                          )
                        }
                      </td>

                      <td>
                        ${
                          escapeHTML(
                            message.contact
                          )
                        }
                      </td>

                      <td
                        style="
                          max-width:320px;
                        "
                      >
                        ${
                          escapeHTML(
                            message.message
                          )
                        }
                      </td>

                      <td>
                        ${
                          message.read
                            ? `
                              <span
                                class="
                                  pill confirmed
                                "
                              >
                                Leído
                              </span>
                            `
                            : `
                              <button
                                class="mini-btn"
                                onclick="
                                  markRead(
                                    '${message.id}'
                                  )
                                "
                              >
                                Marcar leído
                              </button>
                            `
                        }
                      </td>
                    </tr>
                  `)
                  .join('')
              : `
                <tr>
                  <td colspan="5">
                    <div class="empty">
                      No hay mensajes todavía.
                    </div>
                  </td>
                </tr>
              `
          }
        </table>
      </div>
    `;
}

async function markRead(id){
  try{
    const { error } =
      await supabaseClient
        .from('messages')
        .update({
          is_read: true
        })
        .eq('id', id);

    if(error){
      throw error;
    }

    await loadAdminData();
    renderAdminMessages();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo marcar el mensaje como leído.'
    );
  }
}

/* ==================================================================
   ADMINISTRADOR: AJUSTES
   ================================================================== */

function renderAdminSettings(){
  const settings = DB.settings;

  document
    .getElementById(
      'admin-main'
    )
    .innerHTML = `
      <h2>
        Ajustes del sitio
      </h2>

      <p
        class="lede"
        style="margin-bottom:22px;"
      >
        Esta información alimenta las
        secciones de Contacto y
        Preguntas frecuentes.
      </p>

      <div class="panel">
        <div class="field">
          <label>
            Número de WhatsApp
            (con código de país,
            sin espacios ni +)
          </label>

          <input
            id="set-wa"
            value="${
              escapeHTML(
                settings.whatsapp
              )
            }"
          >
        </div>

        <div class="field">
          <label>
            Usuario de Instagram
          </label>

          <input
            id="set-ig"
            value="${
              escapeHTML(
                settings.instagram
              )
            }"
          >
        </div>

        <div class="field">
          <label>
            Zonas de cobertura
          </label>

          <textarea
            id="set-zonas"
            rows="3"
          >${
            escapeHTML(
              settings.zonas
            )
          }</textarea>
        </div>

        <div class="field">
          <label>
            Respuesta sobre auto propio
          </label>

          <textarea
            id="set-autopropio"
            rows="3"
          >${
            escapeHTML(
              settings.autoPropio
            )
          }</textarea>
        </div>

        <div class="field">
          <label>
            Requisitos para empezar
          </label>

          <textarea
            id="set-requisitos"
            rows="3"
          >${
            escapeHTML(
              settings.requisitos
            )
          }</textarea>
        </div>

        <div class="field">
          <label>
            Política de cancelación
          </label>

          <textarea
            id="set-cancelacion"
            rows="3"
          >${
            escapeHTML(
              settings.cancelacion
            )
          }</textarea>
        </div>

        <button
          class="cta-btn"
          onclick="saveSettings()"
        >
          Guardar ajustes
        </button>

        <div id="settings-msg"></div>
      </div>

      <div class="demo-note">
        El acceso administrativo está
        protegido con Supabase Auth.
        Cada administradora debe usar
        su propio correo y contraseña.
      </div>
    `;
}

async function saveSettings(){
  const messageBox =
    document.getElementById(
      'settings-msg'
    );

  try{
    const { error } =
      await supabaseClient
        .from('site_settings')
        .update({
          whatsapp:
            document
              .getElementById(
                'set-wa'
              )
              .value
              .trim(),

          instagram:
            document
              .getElementById(
                'set-ig'
              )
              .value
              .trim(),

          zones:
            document
              .getElementById(
                'set-zonas'
              )
              .value
              .trim(),

          own_car:
            document
              .getElementById(
                'set-autopropio'
              )
              .value
              .trim(),

          requirements:
            document
              .getElementById(
                'set-requisitos'
              )
              .value
              .trim(),

          cancellation_policy:
            document
              .getElementById(
                'set-cancelacion'
              )
              .value
              .trim(),

          updated_at:
            new Date().toISOString()
        })
        .eq('id', 1);

    if(error){
      throw error;
    }

    await loadAdminData();

    messageBox.innerHTML = `
      <div class="success-box">
        Ajustes guardados.
      </div>
    `;
  }catch(error){
    console.error(
      'No se pudieron guardar los ajustes:',
      error
    );

    messageBox.innerHTML = `
      <div class="error-box">
        No se pudieron guardar
        los ajustes.
      </div>
    `;
  }
}

/* ==================================================================
   INICIO DEL SISTEMA
   ================================================================== */

async function init(){
  try{
    await loadDB();
  }catch(error){
    console.error(
      'No se pudo cargar la información inicial:',
      error
    );

    DB = defaultDB();
  }

  try{
    adminAuthed =
      await currentSessionIsAdmin();
  }catch(error){
    adminAuthed = false;
  }

  renderPublicNav();
  buildPublicSections();
  renderContact();

  await goPublic('inicio');
}

supabaseClient
  .auth
  .onAuthStateChange(
    (event, session)=>{
      if(
        event === 'SIGNED_OUT' ||
        !session
      ){
        adminAuthed = false;
      }
    }
  );

init();