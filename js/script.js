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

function formatMoneyInputValue(value){

  if(
    value === null ||
    value === undefined ||
    value === ''
  ){
    return '';
  }


  /*
    Si viene directamente de Supabase
    como número, lo mostramos con
    formato argentino.
  */
  if(typeof value === 'number'){

    return value.toLocaleString(
      'es-AR',
      {
        minimumFractionDigits:0,
        maximumFractionDigits:2
      }
    );
  }


  let text =
    String(value)
      .replace(/[^\d,.]/g, '');


  /*
    Quitamos los puntos anteriores
    para volver a calcular los miles.
  */
  text =
    text.replace(/\./g, '');


  const hasComma =
    text.includes(',');


  let [
    integerPart,
    decimalPart = ''
  ] = text.split(',');


  /*
    Evita cosas como 00015.000
  */
  integerPart =
    integerPart.replace(
      /^0+(?=\d)/,
      ''
    );


  const formattedInteger =
    integerPart.replace(
      /\B(?=(\d{3})+(?!\d))/g,
      '.'
    );


  if(hasComma){

    decimalPart =
      decimalPart
        .replace(/\D/g, '')
        .slice(0, 2);

    return (
      formattedInteger +
      ',' +
      decimalPart
    );
  }


  return formattedInteger;
}


function formatMoneyField(input){

  input.value =
    formatMoneyInputValue(
      input.value
    );
}


function parseMoneyInput(value){

  if(
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  ){
    return null;
  }


  const normalized =
    String(value)

      /*
        Dejamos solamente números,
        puntos y coma.
      */
      .replace(
        /[^\d,.]/g,
        ''
      )

      /*
        Los puntos son separadores
        de miles.
      */
      .replace(
        /\./g,
        ''
      )

      /*
        La coma argentina pasa a
        punto decimal para JavaScript.
      */
      .replace(
        ',',
        '.'
      );


  const number =
    Number(normalized);


  return Number.isFinite(number)
    ? number
    : null;
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
    services:[],
    promos:[],
    settings:{
      whatsapp:'',
      instagram:'',
      zonas:'',
      requisitos:'',
      autoPropio:'',
      cancelacion:'',
      faqs:[]
    },
    schedule:{
  blocked:{}
},
    bookings:[],
    students:[],
    reviews:[],
    messages:[],
    gallery:[],
    studentObservations:[],
    payments:[],
    paymentDues:[],
    weeklyAvailability:[],
    dateOverrides:[]
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


function normalizeFaqItems(
  rawFaqs,
  settingsRow = {}
){
  let items =
    Array.isArray(rawFaqs)
      ? rawFaqs
      : [];

  if(!items.length){
    items = [
      {
        id:'faq-zonas',
        question:'¿En qué zonas trabajan?',
        answer:settingsRow.zones || ''
      },
      {
        id:'faq-auto',
        question:'¿Necesito auto propio para las clases?',
        answer:settingsRow.own_car || ''
      },
      {
        id:'faq-requisitos',
        question:'¿Qué necesito para empezar?',
        answer:settingsRow.requirements || ''
      },
      {
        id:'faq-cancelacion',
        question:'¿Cuál es la política de cancelación?',
        answer:settingsRow.cancellation_policy || ''
      }
    ];
  }

  return items
    .map((item,index)=>(
      {
        id:String(
          item.id ||
          ('faq-' + index)
        ),
        question:String(
          item.question ||
          item.q ||
          ''
        ).trim(),
        answer:String(
          item.answer ||
          item.a ||
          ''
        ).trim()
      }
    ))
    .filter(
      item=>
        item.question ||
        item.answer
    );
}

function mapServices(rows){
  return rows.map(row=>({
    id:row.id,
    name:row.name || '',
    type:row.service_type || 'class',

    classes:
      row.classes === null ||
      row.classes === undefined
        ? null
        : Number(row.classes),

    price:
      row.price === null ||
      row.price === undefined
        ? null
        : Number(row.price),

    desc:row.description || '',
    active:row.active !== false
  }));
}

function mapBlockedDays(rows){
  const blocked = {};

  rows.forEach(row=>{
    blocked[row.class_date] = true;
  });

  return blocked;
}

function mapBookings(rows, publicOnly=false){
  return rows.map((row,index)=>({
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

    date:
  row.class_date,

time:
  shortTime(
    row.class_time
  ),

preferredTime:
  publicOnly
    ? ''
    : shortTime(
        row.preferred_time
      ),

    name:
      publicOnly
        ? ''
        : (row.student_name || ''),

    phone:
      publicOnly
        ? ''
        : (row.phone || ''),

    address:
      publicOnly
        ? ''
        : (row.address || ''),

    studentId:
      publicOnly
        ? null
        : (row.student_id || null),

    service:
      publicOnly
        ? ''
        : (row.service_id || ''),

    serviceName:
      publicOnly
        ? ''
        : (row.service_name || ''),

    source:
      publicOnly
        ? 'web'
        : (row.booking_source || 'web'),

    attendanceStatus:
      publicOnly
        ? 'scheduled'
        : (row.attendance_status || 'scheduled'),

    attendanceCounted:
      publicOnly
        ? false
        : !!row.attendance_counted,

    adminNote:
      publicOnly
        ? ''
        : (row.admin_note || ''),

    status:
      publicOnly
        ? 'confirmed'
        : (row.status || 'pending'),

    createdAt:row.created_at || null
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

    id:
      row.id,

    name:
      row.name || '',

    phone:
      row.phone || '',

    address:
      row.address || '',

    hasLicense:
      Boolean(
        row.has_license
      ),

    classesTaken:
      Number(
        row.classes_taken
      ) || 0,

    progress:
      row.progress || ''

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

  const blockedRows =
    requireNoError(
      results[3],
      'No se pudieron cargar los días bloqueados'
    );

  const reviewsRows =
    requireNoError(
      results[4],
      'No se pudieron cargar las reseñas'
    );

  const galleryRows =
    requireNoError(
      results[5],
      'No se pudo cargar la galería'
    );

  DB.services = mapServices(servicesRows);

DB.promos = promosRows.map(row=>({
  id:row.id,
  title:row.title || '',
  desc:row.description || '',
  badge:row.badge || '',
  image:row.image_url || '',
  storagePath:
    row.storage_path || '',

  price:
    row.price === null ||
    row.price === undefined
      ? null
      : Number(row.price),

  active:row.active !== false
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
        .cancellation_policy || '',

    faqs:
      normalizeFaqItems(
        settingsRow.faqs,
        settingsRow
      )
  };

  DB.schedule = {
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
          results[6],
          'No se pudieron cargar las reservas'
        )
      );

    DB.students =
      mapStudents(
        requireNoError(
          results[7],
          'No se pudieron cargar las alumnas'
        )
      );

    DB.messages =
      mapMessages(
        requireNoError(
          results[8],
          'No se pudieron cargar los mensajes'
        )
      );
  }else{
    DB.bookings =
      mapBookings(
        requireNoError(
          results[6],
          'No se pudieron consultar los turnos ocupados'
        ),
        true
      );

    DB.students = [];
    DB.messages = [];
  }

  const [
  weeklyAvailabilityResult,
  dateOverridesResult
] = await Promise.all([

  supabaseClient
    .from('weekly_availability')
    .select('*')
    .order('day_of_week', {
      ascending:true
    })
    .order('start_time', {
      ascending:true
    }),

  supabaseClient
    .from('date_availability_overrides')
    .select('*')
    .gte('class_date', today)
    .order('class_date', {
      ascending:true
    })
    .order('start_time', {
      ascending:true
    })

]);

DB.weeklyAvailability =
  requireNoError(
    weeklyAvailabilityResult,
    'No se pudieron cargar los horarios habituales'
  )
  .map(row=>({
    id:row.id,
    dayOfWeek:Number(row.day_of_week),
    startTime:shortTime(row.start_time),
    endTime:shortTime(row.end_time)
  }));

DB.dateOverrides =
  requireNoError(
    dateOverridesResult,
    'No se pudieron cargar las excepciones de horarios'
  )
  .map(row=>({
    id:row.id,
    date:row.class_date,
    startTime:shortTime(row.start_time),
    endTime:shortTime(row.end_time)
  }));

  if(includePrivate){

  const observationsResult =
    await supabaseClient
      .from('student_observations')
      .select('*')
      .order(
        'observation_date',
        { ascending:false }
      )
      .order(
        'created_at',
        { ascending:false }
      );


  DB.studentObservations =
    requireNoError(
      observationsResult,
      'No se pudieron cargar las observaciones'
    )
    .map(row=>({

      id:
        row.id,

      studentId:
        row.student_id,

      observation:
        row.observation || '',

      date:
        row.observation_date,

      createdAt:
        row.created_at

    }));

}else{

  DB.studentObservations = [];

}
  
  if(includePrivate){

  const [
    paymentsResult,
    duesResult
  ] = await Promise.all([

    supabaseClient
      .from('payments')
      .select('*')
      .order(
        'payment_date',
        { ascending:false }
      )
      .order(
        'created_at',
        { ascending:false }
      ),

    supabaseClient
      .from('payment_dues')
      .select('*')
      .order(
        'due_date',
        { ascending:false }
      )
      .order(
        'created_at',
        { ascending:false }
      )

  ]);


  DB.payments =
    requireNoError(
      paymentsResult,
      'No se pudieron cargar los pagos'
    )
    .map(row=>({

      id:
        row.id,

      studentId:
        row.student_id,

      studentName:
        row.student_name || '',

      amount:
        Number(row.amount) || 0,

      method:
        row.payment_method || '',

      date:
        row.payment_date,

      description:
        row.description || '',

      createdAt:
        row.created_at

    }));


  DB.paymentDues =
    requireNoError(
      duesResult,
      'No se pudieron cargar los saldos pendientes'
    )
    .map(row=>({

      id:
        row.id,

      studentId:
        row.student_id,

      studentName:
        row.student_name || '',

      amount:
        Number(row.amount) || 0,

      description:
        row.description || '',

      date:
        row.due_date,

      status:
        row.status || 'pending',

      resolvedAt:
        row.resolved_at,

      paymentId:
        row.payment_id,

      createdAt:
        row.created_at

    }));

}else{

  DB.payments = [];
  DB.paymentDues = [];

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

  const today =
    todayISO();


  const [
    weeklyResult,
    overridesResult,
    blockedResult,
    bookedResult
  ] = await Promise.all([

    supabaseClient
      .from(
        'weekly_availability'
      )
      .select('*')
      .order(
        'day_of_week',
        { ascending:true }
      )
      .order(
        'start_time',
        { ascending:true }
      ),


    supabaseClient
      .from(
        'date_availability_overrides'
      )
      .select('*')
      .gte(
        'class_date',
        today
      )
      .order(
        'class_date',
        { ascending:true }
      )
      .order(
        'start_time',
        { ascending:true }
      ),


    supabaseClient
      .from(
        'blocked_days'
      )
      .select(
        'class_date'
      )
      .gte(
        'class_date',
        today
      ),


    supabaseClient.rpc(
      'get_booked_slots'
    )

  ]);


  DB.weeklyAvailability =
    requireNoError(
      weeklyResult,
      'No se pudieron actualizar los horarios habituales'
    )
    .map(row=>({

      id:
        row.id,

      dayOfWeek:
        Number(
          row.day_of_week
        ),

      startTime:
        shortTime(
          row.start_time
        ),

      endTime:
        shortTime(
          row.end_time
        )

    }));


  DB.dateOverrides =
    requireNoError(
      overridesResult,
      'No se pudieron actualizar los horarios especiales'
    )
    .map(row=>({

      id:
        row.id,

      date:
        row.class_date,

      startTime:
        shortTime(
          row.start_time
        ),

      endTime:
        shortTime(
          row.end_time
        )

    }));


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
    label: 'Promociones'
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

const NAV_STATE_KEYS = {
  view: 'escuela_manejo_current_view',
  publicSection: 'escuela_manejo_public_section',
  adminTab: 'escuela_manejo_admin_tab'
};

function saveCurrentView(view){
  sessionStorage.setItem(
    NAV_STATE_KEYS.view,
    view
  );
}

function getSavedPublicSection(){
  const saved =
    sessionStorage.getItem(
      NAV_STATE_KEYS.publicSection
    );

  return PUB_SECTIONS.some(
    section=>section.id === saved
  )
    ? saved
    : 'inicio';
}

function getSavedAdminTab(){
  const saved =
    sessionStorage.getItem(
      NAV_STATE_KEYS.adminTab
    );

  return ADMIN_TABS.some(
    tab=>tab.id === saved
  )
    ? saved
    : 'dashboard';
}

let currentPub = 'inicio';


function ensurePublicOnePageStyles(){
  if(
    document.getElementById(
      'public-one-page-styles'
    )
  ){
    return;
  }

  const style =
    document.createElement(
      'style'
    );

  style.id =
    'public-one-page-styles';

  style.textContent = `
    html{
      scroll-behavior:smooth;
    }

    #public-view header.site{
      box-shadow:
        0 8px 28px
        rgba(10,18,27,.12);
    }

    #pub-sections > section{
      scroll-margin-top:90px;
      position:relative;
      border-bottom:
        1px solid
        rgba(31,45,60,.07);
    }

    #pub-sections .panel,
    #pub-sections .faq-item,
    #pub-sections .gphoto{
      transition:
        transform .18s ease,
        box-shadow .18s ease,
        border-color .18s ease;
    }

    @media(hover:hover){
      #pub-sections .panel:hover,
      #pub-sections .faq-item:hover,
      #pub-sections .gphoto:hover{
        transform:translateY(-2px);
        box-shadow:
          0 12px 30px
          rgba(25,37,49,.08);
      }
    }

    #sec-servicios,
    #sec-galeria,
    #sec-contacto{
      background:
        linear-gradient(
          180deg,
          var(--cream) 0%,
          #fffdf8 100%
        );
    }

    #sec-reservas,
    #sec-faq{
      background:
        linear-gradient(
          180deg,
          var(--cream-dim) 0%,
          #f5efe3 100%
        ) !important;
    }

    #sec-resenas{
      background:
        linear-gradient(
          180deg,
          #fffdf8 0%,
          var(--cream) 100%
        );
    }

    @media(max-width:760px){
      #pub-sections > section{
        scroll-margin-top:78px;
      }

      #public-view header.site{
        backdrop-filter:blur(10px);
        -webkit-backdrop-filter:blur(10px);
      }
    }
  `;

  document.head
    .appendChild(style);
}

function updatePublicNavActive(id){
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
}

function setupPublicSectionObserver(){
  if(window.__publicSectionObserver){
    window.__publicSectionObserver
      .disconnect();
  }

  const sections =
    Array.from(
      document.querySelectorAll(
        '#pub-sections > section'
      )
    );

  if(!sections.length){
    return;
  }

  window.__publicSectionObserver =
    new IntersectionObserver(
      entries=>{
        const visible =
          entries
            .filter(
              entry=>entry.isIntersecting
            )
            .sort(
              (a,b)=>
                b.intersectionRatio -
                a.intersectionRatio
            )[0];

        if(!visible){
          return;
        }

        const id =
          visible.target.id.replace(
            'sec-',
            ''
          );

        if(
          PUB_SECTIONS.some(
            section=>section.id === id
          )
        ){
          updatePublicNavActive(id);
          sessionStorage.setItem(
            NAV_STATE_KEYS.publicSection,
            id
          );
        }
      },
      {
        root:null,
        rootMargin:'-22% 0px -58% 0px',
        threshold:[0.05,0.15,0.3,0.5]
      }
    );

  sections.forEach(
    section=>
      window.__publicSectionObserver
        .observe(section)
  );
}

async function renderAllPublicSections(){
  renderServicesPublic();
  renderGalleryPublic();
  renderReviewsPublic();
  renderFAQ();
  renderContact();

  await refreshPublicSchedule();
  renderCalendarPublic();
  setupPublicSectionObserver();
}

function toggleMobileNav(){
  document
    .getElementById('pub-nav')
    .classList
    .toggle('open');
}

async function goPublic(id){
  if(
    !PUB_SECTIONS.some(
      section=>section.id === id
    )
  ){
    id = 'inicio';
  }

  currentPub = id;

  sessionStorage.setItem(
    NAV_STATE_KEYS.publicSection,
    id
  );

  saveCurrentView('public');
  updatePublicNavActive(id);

  const publicNav =
    document.getElementById(
      'pub-nav'
    );

  if(publicNav){
    publicNav.classList.remove(
      'open'
    );
  }

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
  }

  const target =
    document.getElementById(
      'sec-' + id
    );

  if(target){
    target.scrollIntoView({
      behavior:'smooth',
      block:'start'
    });
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
      <div class="hero hero-redesign">
        <div class="wrap hero-redesign-wrap">

          <div class="hero-copy-modern">
            <div class="eyebrow">
              Clases de manejo en Tucumán
            </div>

            <h1>
              Aprendé a conducir.<br>
              <em>Ganá confianza.</em><br>
              Disfrutá tu libertad.
            </h1>

            <p class="sub">
              En cada clase te acompaño a desarrollar
              confianza, seguridad, calma y control al volante.
              Con paciencia, motivación y una enseñanza personalizada.
            </p>

            <div class="ctas hero-actions-modern">
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
                Ver promociones
              </button>
            </div>

            <div class="badge-row hero-values">
              <div class="badge">
                ${icon('shield')}
                Seguridad
              </div>

              <div class="badge">
                ${icon('heart')}
                Confianza
              </div>

              <div class="badge">
                ${icon('wheel')}
                Manejo defensivo
              </div>
            </div>
          </div>

          <div class="hero-media-modern">
            <div class="hero-image-frame">
              <img
                src="./img/hero-instructora.png"
                alt="Instructora de manejo junto a un automóvil"
              >
            </div>
          </div>

        </div>

        <div class="route-line-modern" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
          <b>⌖</b>
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

function promoArtVariant(
  promo,
  fallbackIndex = 0
){

  const key =
    String(
      promo &&
      promo.id
        ? promo.id
        : fallbackIndex
    );


  let hash = 0;

  for(
    let index = 0;
    index < key.length;
    index++
  ){

    hash =
      (
        (
          hash << 5
        ) -
        hash
      ) +
      key.charCodeAt(
        index
      );

    hash |= 0;

  }


  return (
    Math.abs(hash) % 6
  ) + 1;

}


function promoArtworkHTML(
  promo,
  index = 0,
  {
    admin = false
  } = {}
){

  if(
    promo &&
    promo.image
  ){

    return `
      <div
        class="
          promotion-modern-art
          has-real-image
        "
      >
        <img
          src="${
            escapeHTML(
              promo.image
            )
          }"
          alt="${
            admin
              ? 'Imagen de la promoción'
              : (
                  'Promoción ' +
                  escapeHTML(
                    promo.title
                  )
                )
          }"
          loading="lazy"
        >
      </div>
    `;

  }


  const variant =
    promoArtVariant(
      promo,
      index
    );


  return `
    <div
      class="
        promotion-modern-art
        promo-art-variant-${variant}
      "
      aria-hidden="true"
    >
      <span>♥</span>
      <span>♥</span>
      <span>♥</span>

      <div
        class="promotion-road-line"
      ></div>

      <div
        class="promotion-road-dot"
      ></div>
    </div>
  `;

}


async function uploadPromoImageFile(
  file
){

  if(!file){
    return null;
  }


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
    await resizeImageFile(
      file
    );


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
      .slice(
        0,
        60
      );


  const storagePath =
    user.id +
    '/' +
    Date.now() +
    '-promo-' +
    (
      safeName ||
      'promocion'
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


  return {
    imageUrl:
      publicUrlData.publicUrl,
    storagePath
  };

}


async function deletePromoStorageImage(
  storagePath
){

  if(!storagePath){
    return;
  }


  const {
    error
  } =
    await supabaseClient
      .storage
      .from('gallery')
      .remove([
        storagePath
      ]);


  if(error){

    console.warn(
      'No se pudo eliminar la imagen anterior de la promoción:',
      error
    );

  }

}


function renderServicesPublic(){

  const activePromos =
    (DB.promos || [])
      .filter(
        promo=>promo.active
      );

  const container =
    document.getElementById(
      'promos-strip'
    );

  if(!container){
    return;
  }

  const whatsapp =
    DB.settings &&
    DB.settings.whatsapp
      ? DB.settings.whatsapp
      : '';

  container.innerHTML =
    activePromos.length
      ? `
          <div class="promotion-modern-grid">
            ${activePromos.map(
              promo=>{

                const message =
                  'Hola! Quiero consultar por la promoción "' +
                  promo.title +
                  '".';

                return `
                  <article class="promotion-modern-card">
                    ${
                      promoArtworkHTML(
                        promo,
                        activePromos.indexOf(
                          promo
                        )
                      )
                    }

                    <div class="promotion-modern-copy">
                      ${
                        promo.badge
                          ? `
                              <div class="promo-badge-modern">
                                ${escapeHTML(promo.badge)}
                              </div>
                            `
                          : ''
                      }

                      <h3>
                        ${escapeHTML(promo.title)}
                      </h3>

                      <p>
                        ${
                          promo.desc
                            ? escapeHTML(promo.desc)
                            : 'Consultanos para conocer todos los detalles de esta promoción.'
                        }
                      </p>

                      ${
                        promo.price !== null &&
                        promo.price !== undefined
                          ? `
                              <div class="promotion-price-modern">
                                ${fmtMoney(promo.price)}
                              </div>
                            `
                          : ''
                      }
                    </div>

                    ${
                      whatsapp
                        ? `
                            <a
                              class="cta-btn promotion-modern-button"
                              target="_blank"
                              rel="noopener noreferrer"
                              href="${waLink(whatsapp, message)}"
                            >
                              Consultar por WhatsApp
                            </a>
                          `
                        : `
                            <button
                              class="cta-btn promotion-modern-button"
                              type="button"
                              disabled
                            >
                              Consultar por WhatsApp
                            </button>
                          `
                    }
                  </article>
                `;
              }
            ).join('')}
          </div>
        `
      : `
          <div class="empty">
            No hay promociones activas en este momento.
          </div>
        `;
}

/* ==================================================================
   RENDER: CALENDARIO PÚBLICO Y RESERVA
   ================================================================== */

let pubMonthOffset = 0;
let pubSelectedDate = null;
let pubSelectedTime = null;
let pubPreferredTime = null;
let pubTimeMode = null;
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

function timeToMinutes(time){
  const [hours, minutes] =
    String(time)
      .split(':')
      .map(Number);

  return (
    hours * 60 +
    minutes
  );
}

function minutesToTime(minutes){
  const hours =
    Math.floor(minutes / 60);

  const mins =
    minutes % 60;

  return (
    String(hours).padStart(2, '0') +
    ':' +
    String(mins).padStart(2, '0')
  );
}

function createSlotsFromRanges(ranges){

  const slots = [];

  ranges.forEach(range=>{

    const start =
      timeToMinutes(
        range.startTime
      );

    const end =
      timeToMinutes(
        range.endTime
      );

    for(
      let current = start;
      current <= end;
      current += 30
    ){

      const time =
        minutesToTime(current);

      if(!slots.includes(time)){
        slots.push(time);
      }
    }

    /*
      El horario final siempre se incluye,
      incluso si el rango no coincide
      exactamente con saltos de 30 minutos.

      Ej:
      09:10 - 12:00
      también permite elegir 12:00.
    */
    if(
      range.endTime &&
      !slots.includes(range.endTime)
    ){
      slots.push(range.endTime);
    }

  });

  return slots.sort();
}

function getScheduleRangesForDate(iso){

  if(
    DB.schedule.blocked[iso]
  ){
    return [];
  }

  /*
    Si hay horarios especiales para esa fecha,
    reemplazan al horario semanal.
  */
  const overrides =
    (DB.dateOverrides || [])
      .filter(item=>
        item.date === iso
      );

  if(overrides.length){
    return overrides;
  }


  /*
    Usamos T12:00 para evitar problemas
    de zona horaria al calcular el día.
  */
  const date =
    new Date(
      iso + 'T12:00:00'
    );

  const dayOfWeek =
    date.getDay();

  return (
    DB.weeklyAvailability || []
  ).filter(item=>
    item.dayOfWeek === dayOfWeek
  );
}

function scheduleSlotsForDate(iso){

  return createSlotsFromRanges(
    getScheduleRangesForDate(iso)
  );
}

function bookingOccupiesSlot(booking){

  return (
    booking.status === 'pending' ||
    booking.status === 'confirmed'
  );
}

function bookingIsActive(
  booking
){

  return (
    booking.status ===
      'pending' ||

    booking.status ===
      'confirmed'
  );

}


function bookingEffectiveTime(
  booking
){

  return (
    booking.time ||
    booking.preferredTime ||
    ''
  );

}


function isTimeOccupied(
  iso,
  time,
  excludeBookingId = null
){

  return DB.bookings.some(
    booking=>

      booking.date === iso &&

      booking.id !==
        excludeBookingId &&

      bookingIsActive(
        booking
      ) &&

      bookingEffectiveTime(
        booking
      ) === time
  );

}

function slotsLeft(
  iso,
  excludeBookingId
){

  const all =
    scheduleSlotsForDate(
      iso
    );


  const taken =
    DB.bookings

      .filter(
        booking=>

          booking.date === iso &&

          bookingIsActive(
            booking
          ) &&

          booking.id !==
            excludeBookingId
      )

      .map(
        booking=>
          bookingEffectiveTime(
            booking
          )
      );


  return all.filter(
    time=>
      !taken.includes(
        time
      )
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
  pubPreferredTime = null;
  pubTimeMode = null;

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


function ensureAdminCalendarStyles(){

  if(
    document.getElementById(
      'admin-calendar-mobile-styles'
    )
  ){
    return;
  }


  const style =
    document.createElement(
      'style'
    );

  style.id =
    'admin-calendar-mobile-styles';

  style.textContent = `
    #cal-admin .cal-day.past{
      cursor:pointer;
    }

    #cal-admin
    .cal-day.past:hover{
      outline:
        2px solid
        rgba(58,76,97,.20);
    }

    @media(max-width:768px){

      #cal-admin .cal-day{
        min-height:44px;
        aspect-ratio:1;
        padding:5px 4px;
        align-items:flex-start;
        justify-content:flex-start;
        box-sizing:border-box;
      }

      #cal-admin
      .cal-date-number{
        position:relative;
        z-index:2;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-width:17px;
        min-height:17px;
        font-size:11px;
        line-height:1;
      }

      #cal-admin
      .admin-cal-markers{
        position:absolute;
        left:3px;
        right:3px;
        bottom:3px;
        display:flex;
        align-items:center;
        justify-content:flex-end;
        gap:2px;
        margin:0;
        pointer-events:none;
      }

      #cal-admin
      .admin-cal-marker{
        width:13px !important;
        height:13px !important;
        min-width:13px !important;
        min-height:13px !important;
        padding:0 !important;
        margin:0 !important;
        border-radius:50% !important;
        display:inline-flex !important;
        align-items:center;
        justify-content:center;
        font-size:8px !important;
        line-height:1 !important;
        font-weight:700;
      }

      #cal-admin
      .admin-cal-marker
      .marker-text{
        transform:
          translateY(.2px);
      }

      #cal-admin
      .pending-booking{
        background:
          var(--amber) !important;
        color:
          var(--asphalt) !important;
      }

      #cal-admin
      .confirmed-booking{
        background:
          var(--sage) !important;
        color:white !important;
      }

      #cal-admin
      .cal-day.past{
        opacity:.82;
      }

      #cal-admin
      .cal-day.past
      .admin-cal-marker{
        opacity:1;
      }

    }
  `;


  document.head
    .appendChild(style);

}


function buildCalendar(
  containerId,
  offset,
  options
){

  if(options.mode === 'admin'){
    ensureAdminCalendarStyles();
  }

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

            const availableSlots =
  scheduleSlotsForDate(iso);

const hasAvailability =
  availableSlots.length > 0;

            const adminBookingsDay =
  options.mode === 'admin'
    ? DB.bookings.filter(
        booking=>
          booking.date === iso
      )
    : [];


const pendingBookings =
  adminBookingsDay.filter(
    booking=>
      booking.status === 'pending'
  ).length;


const confirmedBookings =
  adminBookingsDay.filter(
    booking=>
      booking.status === 'confirmed'
  ).length;

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
                ? true
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
                <span class="cal-date-number">
                  ${date.getDate()}
                </span>

                ${
  options.mode === 'admin' &&
  (
    pendingBookings > 0 ||
    confirmedBookings > 0
  )
    ? `
        <div class="admin-cal-markers">

          ${
            pendingBookings > 0
              ? `
                  <span
                    class="
                      admin-cal-marker
                      pending-booking
                    "
                    title="${
                      pendingBookings
                    } solicitud${
                      pendingBookings === 1
                        ? ''
                        : 'es'
                    } pendiente${
                      pendingBookings === 1
                        ? ''
                        : 's'
                    }"
                  >
                    <span class="marker-text">
                      ${pendingBookings}
                    </span>
                  </span>
                `
              : ''
          }


          ${
            confirmedBookings > 0
              ? `
                  <span
                    class="
                      admin-cal-marker
                      confirmed-booking
                    "
                    title="${
                      confirmedBookings
                    } clase${
                      confirmedBookings === 1
                        ? ''
                        : 's'
                    } confirmada${
                      confirmedBookings === 1
                        ? ''
                        : 's'
                    }"
                  >
                    <span class="marker-text">
                      ${confirmedBookings}
                    </span>
                  </span>
                `
              : ''
          }

        </div>
      `
    : ''
}

                ${
  options.mode !== 'admin' &&
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

      <h3>
        Elegí un día
      </h3>

      <p
        class="lede"
        style="margin:0;"
      >
        Elegí una fecha en el calendario
        para solicitar tu clase.
      </p>

    `;

    return;
  }


  const free =
    slotsLeft(
      pubSelectedDate
    );


  panel.innerHTML = `

    <h3>
      ${fmtDateHuman(
        pubSelectedDate
      )}
    </h3>


    <p
      style="
        color:var(--ink-soft);
        font-size:14px;
        margin-bottom:14px;
      "
    >
      Podés elegir uno de los horarios
      disponibles o proponernos otro
      horario que te quede mejor.
    </p>


    <h4>
      Horarios disponibles
    </h4>


    ${
      free.length

        ? `

            <div class="slot-list">

              ${free.map(
                time=>`

                  <button
                    type="button"
                    class="
                      slot-btn
                      ${
                        pubTimeMode ===
                          'available' &&
                        pubSelectedTime ===
                          time

                          ? 'picked'
                          : ''
                      }
                    "
                    onclick="
                      pickTime(
                        '${time}'
                      )
                    "
                  >
                    ${time}
                  </button>

                `
              ).join('')}

            </div>

          `

        : `

            <p class="note">
              No quedan horarios de los
              publicados disponibles para
              este día, pero podés proponernos
              otro horario.
            </p>

          `
    }


    <div
      style="
        display:flex;
        align-items:center;
        gap:12px;
        margin:22px 0;
      "
    >

      <div
        style="
          height:1px;
          background:var(--line);
          flex:1;
        "
      ></div>

      <span class="note">
        O
      </span>

      <div
        style="
          height:1px;
          background:var(--line);
          flex:1;
        "
      ></div>

    </div>


    <div class="field">

      <label>
        Proponer otro horario
      </label>

      <input
  id="bk-preferred-time-choice"
  type="time"
  value="${
    pubPreferredTime || ''
  }"
>

      <button
  type="button"
  class="mini-btn"
  style="margin-top:10px;"
  onclick="
    confirmPreferredTime()
  "
>
  Usar este horario
</button>

      <p class="note">
        Podés indicarnos una hora distinta.
        Este horario queda como preferencia
        y será confirmado por WhatsApp.
      </p>

    </div>


    ${
      pubTimeMode === 'available' &&
      pubSelectedTime

        ? `

            <div
              class="success-box"
              style="margin-top:14px;"
            >
              Horario elegido:
              <strong>
                ${pubSelectedTime}
              </strong>
            </div>

          `

        : ''
    }


    ${
      pubTimeMode === 'preferred' &&
      pubPreferredTime

        ? `

            <div
              class="success-box"
              style="margin-top:14px;"
            >
              Horario preferido:
              <strong>
                ${pubPreferredTime}
              </strong>

              <br>

              <span
                style="
                  font-size:13px;
                "
              >
                Lo confirmaremos por
                WhatsApp.
              </span>
            </div>

          `

        : ''
    }


    ${
      pubTimeMode

        ? bookingFormHTML()

        : `

            <p
              class="note"
              style="
                margin-top:16px;
                text-align:center;
              "
            >
              Elegí un horario para
              continuar con la solicitud.
            </p>

          `
    }

  `;

}

function pickTime(time){

  pubSelectedTime =
    time;

  pubPreferredTime =
    null;

  pubTimeMode =
    'available';

  renderSlotPanel();

}


async function confirmPreferredTime(){

  const input =
    document.getElementById(
      'bk-preferred-time-choice'
    );


  if(!input){
    return;
  }


  const time =
    input.value;


  if(!time){

    alert(
      'Elegí un horario primero.'
    );

    return;
  }


  try{

    /*
      Traemos nuevamente los horarios
      ocupados para no trabajar con
      información vieja.
    */

    await refreshPublicSchedule();


    if(
      isTimeOccupied(
        pubSelectedDate,
        time
      )
    ){

      alert(
        'Ese horario ya fue solicitado. Elegí otro horario.'
      );

      renderCalendarPublic();

      return;
    }


    pubPreferredTime =
      time;

    pubSelectedTime =
      null;

    pubTimeMode =
      'preferred';


    renderSlotPanel();


  }catch(error){

    console.error(
      'No se pudo verificar el horario:',
      error
    );

    alert(
      'No pudimos verificar el horario. Intentá nuevamente.'
    );

  }

}

function bookingFormHTML(){

  const chosenTime =
    pubTimeMode === 'available'

      ? pubSelectedTime

      : pubPreferredTime;


  const timeLabel =
    pubTimeMode === 'available'

      ? 'Horario elegido'

      : 'Horario preferido';


  return `

    <form
      onsubmit="
        return submitBooking(event)
      "
      style="
        margin-top:18px;
        border-top:
          1px solid var(--line);
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
          placeholder="
            Ejemplo: 381 o 3865
          "
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
          Dirección de tu domicilio
        </label>

        <input
          required
          id="bk-address"
          autocomplete="street-address"
          placeholder="Ejemplo: San Martín 1250"
        >

        <p class="note">
          Escribí la dirección desde donde
          vas a realizar la clase.
        </p>

      </div>


      <div
        class="note"
        style="
          margin-bottom:14px;
        "
      >
        ${timeLabel}:
        <strong>
          ${chosenTime}
        </strong>
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
      .getElementById(
        'bk-name'
      )
      .value
      .trim();


  const areaCode =
    document
      .getElementById(
        'bk-area-code'
      )
      .value
      .replace(
        /\D/g,
        ''
      );


  const phoneNumber =
    document
      .getElementById(
        'bk-phone-number'
      )
      .value
      .replace(
        /\D/g,
        ''
      );


  const address =
    document
      .getElementById(
        'bk-address'
      )
      .value
      .trim();

  if(address.length < 5){
    messageBox.innerHTML = `
      <div class="error-box">
        Ingresá la dirección de tu domicilio.
      </div>
    `;
    return false;
  }


  const hasAvailableTime =
    pubTimeMode ===
      'available' &&
    Boolean(
      pubSelectedTime
    );


  const hasPreferredTime =
    pubTimeMode ===
      'preferred' &&
    Boolean(
      pubPreferredTime
    );


  if(
    !hasAvailableTime &&
    !hasPreferredTime
  ){

    messageBox.innerHTML = `

      <div class="error-box">
        Elegí un horario disponible
        o proponé otro horario.
      </div>

    `;

    return false;
  }


  const nationalNumber =
    areaCode +
    phoneNumber;


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
    '549' +
    nationalNumber;


  /*
    Guardamos estos valores antes
    de refrescar o limpiar el formulario.
  */

  const chosenDate =
    pubSelectedDate;


  const requestedTime =
    hasAvailableTime

      ? pubSelectedTime

      : pubPreferredTime;


  const requestedMode =
    pubTimeMode;


  try{

    submitButton.disabled =
      true;

    submitButton.textContent =
      'Guardando solicitud…';

    messageBox.innerHTML =
      '';


    /*
  Volvemos a consultar justo antes
  de guardar la solicitud.

  Esto funciona tanto para un horario
  publicado como para uno propuesto.
*/

await refreshPublicSchedule();


if(
  isTimeOccupied(
    pubSelectedDate,
    requestedTime
  )
){

  messageBox.innerHTML = `

    <div class="error-box">

      Ese horario acaba de ser
      solicitado por otra persona.

      <br><br>

      Elegí otro horario.

    </div>

  `;


  renderCalendarPublic();

  return false;
}


/*
  Si eligió uno de los horarios
  publicados, además comprobamos
  que siga disponible dentro del
  horario configurado.
*/

if(
  hasAvailableTime &&
  !slotsLeft(
    pubSelectedDate
  ).includes(
    pubSelectedTime
  )
){

  messageBox.innerHTML = `

    <div class="error-box">

      Ese horario ya no está
      disponible.

      <br><br>

      Elegí otro horario.

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


          /*
            Si eligió un turno publicado,
            guardamos class_time.

            Si propuso otro horario,
            class_time queda null hasta
            que la administradora confirme.
          */

          class_time:
            hasAvailableTime
              ? pubSelectedTime
              : null,


          preferred_time:
            hasPreferredTime
              ? pubPreferredTime
              : null,


          student_name:
            name,


          phone,


          address,


          service_id:
            null,


          service_name:
            'Clase de manejo',


          booking_source:
            'web',


          status:
            'pending'

        });


    if(
  error.code ===
    '23505'
){

  await refreshPublicSchedule();

  renderCalendarPublic();


  const panel =
    document.getElementById(
      'slot-panel'
    );


  if(panel){

    panel.innerHTML += `

      <div class="error-box">

        Ese horario acaba de ser
        solicitado por otra persona.

        <br><br>

        Elegí otro horario.

      </div>

    `;
  }


  return false;
}


    pubSelectedTime =
      null;

    pubPreferredTime =
      null;

    pubTimeMode =
      null;


    await refreshPublicSchedule();

    renderCalendarPublic();


    const panel =
      document.getElementById(
        'slot-panel'
      );


    if(panel){

      panel.innerHTML += `

        <div class="success-box">

          ¡Listo,
          ${escapeHTML(name)}!

          <br><br>

          Solicitaste una clase para el
          ${fmtDateHuman(
            chosenDate
          )}.

          <br>

          ${
            requestedMode ===
              'available'

              ? `
                  Elegiste el horario
                  de las
                  <strong>
                    ${requestedTime}
                  </strong>.
                `

              : `
                  Nos indicaste como
                  horario preferido las
                  <strong>
                    ${requestedTime}
                  </strong>.
                `
          }

          <br><br>

          Domicilio:
          <strong>
            ${escapeHTML(address)}
          </strong>.
          <br><br>

          Te vamos a contactar por
          WhatsApp para confirmar
          el turno.

        </div>

      `;
    }


  }catch(error){

    console.error(
      'No se pudo guardar la reserva:',
      error
    );


    messageBox.innerHTML = `

      <div class="error-box">
        No se pudo guardar la solicitud.
        Revisá tu conexión e intentá
        nuevamente.
      </div>

    `;


  }finally{

    submitButton.disabled =
      false;

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
  const container =
    document.getElementById(
      'faq-list'
    );

  if(!container){
    return;
  }

  const items =
    (
      DB.settings &&
      Array.isArray(
        DB.settings.faqs
      )
    )
      ? DB.settings.faqs
      : [];

  container.innerHTML =
    items.length
      ? items
          .map((item,index)=>`
            <div
              class="faq-item"
              id="faq-${index}"
            >
              <button
                class="faq-q"
                type="button"
                onclick="toggleFaq(${index})"
              >
                <span>
                  ${escapeHTML(item.question)}
                </span>
                <span class="chev">+</span>
              </button>

              <div class="faq-a">
                <inner>
                  ${escapeHTML(item.answer)}
                </inner>
              </div>
            </div>
          `)
          .join('')
      : `
          <div class="empty">
            Todavía no hay preguntas frecuentes cargadas.
          </div>
        `;
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

function normalizeInstagramUsername(
  value
){

  let username =
    String(
      value || ''
    )
      .trim();


  username =
    username
      .replace(
        /^https?:\/\/(www\.)?instagram\.com\//i,
        ''
      )
      .replace(
        /^@+/,
        ''
      )
      .replace(
        /\/.*$/,
        ''
      )
      .trim();


  return username;

}


function renderContact(){

  const settings =
    DB.settings;

  const hasWhatsApp =
    Boolean(
      settings.whatsapp
    );

  const instagramUsername =
    normalizeInstagramUsername(
      settings.instagram
    );

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
                class="
                  public-contact-card
                  public-contact-whatsapp
                "
                href="${
                  waLink(
                    settings.whatsapp,
                    'Hola! Quiero consultar por clases de manejo.'
                  )
                }"
                target="_blank"
                rel="
                  noopener noreferrer
                "
                aria-label="
                  Consultar por WhatsApp
                "
              >

                <span
                  class="
                    public-contact-icon
                    public-contact-icon-whatsapp
                  "
                  aria-hidden="true"
                >
                  W
                </span>

                <span
                  class="
                    public-contact-copy
                  "
                >
                  <strong>
                    WhatsApp
                  </strong>

                  <span>
                    Coordinemos tu clase
                  </span>
                </span>

                <b
                  class="
                    public-contact-arrow
                  "
                  aria-hidden="true"
                >
                  →
                </b>

              </a>
            `
          : ''
      }


      ${
        instagramUsername
          ? `
              <a
                class="
                  public-contact-card
                  public-contact-instagram
                "
                href="${
                  'https://instagram.com/' +
                  encodeURIComponent(
                    instagramUsername
                  )
                }"
                target="_blank"
                rel="
                  noopener noreferrer
                "
                aria-label="
                  Abrir Instagram
                  @${escapeHTML(
                    instagramUsername
                  )}
                "
              >

                <span
                  class="
                    public-contact-icon
                    public-contact-icon-instagram
                  "
                  aria-hidden="true"
                >
                  ◎
                </span>

                <span
                  class="
                    public-contact-copy
                  "
                >
                  <strong>
                    Instagram
                  </strong>

                  <span>
                    @${escapeHTML(
                      instagramUsername
                    )}
                  </span>
                </span>

                <b
                  class="
                    public-contact-arrow
                  "
                  aria-hidden="true"
                >
                  →
                </b>

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

  const mobileWhatsAppButton =
    document.getElementById(
      'mobile-wa-btn'
    );


  if(hasWhatsApp){

    const contactHref =
      waLink(
        settings.whatsapp,
        'Hola! Quiero consultar por clases de manejo.'
      );


    if(mobileWhatsAppButton){
      mobileWhatsAppButton.href =
        contactHref;
    }


    if(!whatsAppButton){
      return;
    }


    whatsAppButton
      .classList
      .remove(
        'hidden'
      );


    whatsAppButton.href =
      contactHref;


  }else{

    if(mobileWhatsAppButton){
      mobileWhatsAppButton.href =
        '#';
    }


    if(whatsAppButton){

      whatsAppButton
        .classList
        .add(
          'hidden'
        );

    }

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
        class="public-section promotion-section-modern"
      >
        <div class="wrap public-section-inner">
          <div class="section-intro-modern compact">
            <div class="eyebrow">
              Promociones
            </div>

            <h2 class="title">
              Una oportunidad para empezar
            </h2>

            <p class="lede">
              Conocé las promociones vigentes y consultá por WhatsApp
              la opción que más te interese.
            </p>
          </div>

          <div
            class="promos-strip"
            id="promos-strip"
          ></div>
        </div>
      </section>

      <section
        id="sec-reservas"
        class="public-section booking-section-modern"
      >
        <div class="wrap public-section-inner">
          <div class="section-intro-modern centered">
            <div class="eyebrow">
              Reservas
            </div>

            <h2 class="title">
              Elegí tu turno
            </h2>

            <p class="lede">
              Seleccioná una fecha, elegí un horario y completá tus datos.
              Después coordinamos la confirmación por WhatsApp.
            </p>
          </div>

          <ol class="booking-steps-modern" aria-label="Pasos para reservar">
            <li><span>1</span>Fecha</li>
            <li><span>2</span>Horario</li>
            <li><span>3</span>Tus datos</li>
          </ol>

          <div class="booking-grid booking-grid-modern">
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
        class="public-section gallery-section-modern"
      >
        <div class="wrap public-section-inner">
          <div class="section-intro-modern">
            <div class="eyebrow">
              Egresadas
            </div>

            <h2 class="title">
              Alumnas que ya ganaron confianza al volante
            </h2>

            <p class="lede">
              Historias de alumnas que completaron su proceso y hoy
              manejan con más seguridad y autonomía.
            </p>
          </div>

          <div
            class="gallery-grid gallery-grid-modern"
            id="gallery-grid"
          ></div>
        </div>
      </section>

      <section
        id="sec-resenas"
        class="public-section reviews-section-modern"
      >
        <div class="wrap public-section-inner">
          <div class="section-intro-modern centered">
            <div class="eyebrow">
              Experiencias reales
            </div>

            <h2 class="title">
              Lo que dicen las alumnas
            </h2>
          </div>

          <div
            class="reviews-track reviews-grid-modern"
            id="reviews-track"
          ></div>

          <div class="review-form-modern">
            <div class="panel">
              <h3>
                Dejá tu opinión
              </h3>

              <form
                onsubmit="return submitReview(event)"
              >
                <div class="field">
                  <label>Tu nombre</label>
                  <input required id="rv-name">
                </div>

                <div class="field">
                  <label>Puntaje</label>
                  <select id="rv-rating">
                    <option value="5">★★★★★ Excelente</option>
                    <option value="4">★★★★☆ Muy bueno</option>
                    <option value="3">★★★☆☆ Bueno</option>
                    <option value="2">★★☆☆☆ Regular</option>
                    <option value="1">★☆☆☆☆ Malo</option>
                  </select>
                </div>

                <div class="field">
                  <label>Comentario</label>
                  <textarea required id="rv-comment" rows="3"></textarea>
                </div>

                <button class="cta-btn" type="submit">
                  Enviar opinión
                </button>

                <div id="review-form-msg"></div>
              </form>
            </div>
          </div>
        </div>
      </section>

      <section
        id="sec-faq"
        class="public-section faq-section-modern"
      >
        <div class="wrap public-section-inner faq-layout-modern">
          <div class="section-intro-modern faq-intro-modern">
            <div class="eyebrow">
              Información útil
            </div>

            <h2 class="title">
              Preguntas frecuentes
            </h2>

            <p class="lede">
              Todo lo que necesitás saber antes de comenzar tus clases.
            </p>

            <div class="faq-route-modern" aria-hidden="true">⌖</div>
          </div>

          <div class="faq-accordion-modern">
            <div id="faq-list"></div>
          </div>
        </div>
      </section>

      <section
        id="sec-contacto"
        class="public-section contact-section-modern"
      >
        <div class="wrap public-section-inner contact-layout-modern">
          <div class="contact-copy-modern">
            <div class="eyebrow">
              Contacto
            </div>

            <h2 class="title">
              Hablemos
            </h2>

            <p class="lede">
              Escribime por tu canal favorito o dejame tus datos y te respondo
              a la brevedad.
            </p>

            <div
              class="contact-links"
              id="contact-links"
            ></div>
          </div>

          <div class="panel contact-form-modern">
            <h3>
              Formulario de consultas
            </h3>

            <form
              onsubmit="return submitContact(event)"
            >
              <div class="contact-form-row-modern">
                <div class="field">
                  <label>Nombre</label>
                  <input required id="ct-name" placeholder="Tu nombre">
                </div>

                <div class="field">
                  <label>Teléfono o Instagram</label>
                  <input required id="ct-contact" placeholder="Tu contacto">
                </div>
              </div>

              <div class="field">
                <label>Consulta</label>
                <textarea
                  required
                  id="ct-message"
                  rows="5"
                  placeholder="Contame cómo puedo ayudarte"
                ></textarea>
              </div>

              <button class="cta-btn" type="submit">
                Enviar consulta
              </button>

              <div id="contact-form-msg"></div>
            </form>
          </div>
        </div>
      </section>

      <section class="final-public-cta">
        <div class="wrap final-public-cta-inner">
          <span class="steering-cta-mark" aria-hidden="true">
            ${wheelSVG()}
          </span>

          <div>
            <h2>¿Lista para empezar?</h2>
            <p>El primer paso es animarte. Yo te acompaño.</p>
          </div>

          <button
            class="cta-btn"
            type="button"
            onclick="goPublic('reservas')"
          >
            Reservar mi clase →
          </button>
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
   ADMIN — AUTENTICACIÓN
   ================================================================== */

async function currentSessionIsAdmin(){
  try{
    const {
      data: { session },
      error: sessionError
    } = await supabaseClient
      .auth
      .getSession();

    if(sessionError){
      console.error(
        'Error consultando la sesión:',
        sessionError
      );

      return false;
    }

    if(!session){
      return false;
    }

    const {
      data,
      error
    } = await supabaseClient
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

  }catch(error){
    console.error(
      'Error verificando la sesión administrativa:',
      error
    );

    return false;
  }
}

async function openAdmin(){
  saveCurrentView('admin');

  const publicView =
    document.getElementById(
      'public-view'
    );

  const adminView =
    document.getElementById(
      'admin-view'
    );

  publicView.classList.add(
    'hidden'
  );

  adminView.classList.remove(
    'hidden'
  );

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

async function refreshPublicAfterAdmin(){

  try{
    await loadDB();
    await renderAllPublicSections();
    renderPublicNav();
  }catch(error){
    console.error(
      'No se pudo actualizar el sitio público después del panel:',
      error
    );
  }

}

async function closeAdmin(){
  closeAdminSidebar();
  saveCurrentView('public');

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

  await refreshPublicAfterAdmin();
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
    errorBox.textContent =
      'Correo o contraseña incorrectos.';

    errorBox
      .classList
      .add('hidden');
  }
}

async function handleLogin(event){
  event.preventDefault();

  const form =
    event.currentTarget;

  const emailInput =
    document.getElementById(
      'login-email'
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
    form.querySelector(
      'button[type="submit"]'
    );

  const email =
    emailInput.value
      .trim()
      .toLowerCase();

  const password =
    passwordInput.value;

  errorBox
    .classList
    .add('hidden');

  errorBox.textContent =
    'Correo o contraseña incorrectos.';

  if(!email){
    errorBox.textContent =
      'Ingresá tu correo electrónico.';

    errorBox
      .classList
      .remove('hidden');

    emailInput.focus();

    return false;
  }

  if(!password){
    errorBox.textContent =
      'Ingresá tu contraseña.';

    errorBox
      .classList
      .remove('hidden');

    passwordInput.focus();

    return false;
  }

  try{
    submitButton.disabled =
      true;

    submitButton.textContent =
      'Ingresando…';

    const {
      data,
      error
    } = await supabaseClient
      .auth
      .signInWithPassword({
        email,
        password
      });

    if(error){
      console.error(
        'Error de Supabase Auth:',
        error
      );

      throw error;
    }

    if(!data.session){
      throw new Error(
        'No se pudo iniciar la sesión.'
      );
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

    errorBox
      .classList
      .add('hidden');

    showAdminDashboard();

  }catch(error){
    console.error(
      'No se pudo iniciar sesión:',
      error
    );

    adminAuthed = false;

    const message =
      String(
        error?.message || ''
      ).toLowerCase();

    if(
      message.includes(
        'email not confirmed'
      )
    ){
      errorBox.textContent =
        'El correo todavía no está confirmado en Supabase.';
    }else if(
      message.includes(
        'permisos de administradora'
      )
    ){
      errorBox.textContent =
        'El usuario existe, pero no tiene permisos de administradora.';
    }else if(
      message.includes(
        'invalid login credentials'
      )
    ){
      errorBox.textContent =
        'El correo o la contraseña no coinciden con el usuario de Supabase.';
    }else{
      errorBox.textContent =
        'No se pudo iniciar sesión. Revisá el correo y la contraseña.';
    }

    errorBox
      .classList
      .remove('hidden');

  }finally{
    submitButton.disabled =
      false;

    submitButton.textContent =
      'Ingresar';
  }

  return false;
}

async function logoutAdmin(){
  closeAdminSidebar();

  try{
    const {
      error
    } = await supabaseClient
      .auth
      .signOut();

    if(error){
      throw error;
    }

  }catch(error){
    console.error(
      'No se pudo cerrar la sesión:',
      error
    );
  }

  adminAuthed = false;

  saveCurrentView('public');

  sessionStorage.removeItem(
    NAV_STATE_KEYS.adminTab
  );

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
  await refreshPublicAfterAdmin();
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

  ensureAdminSidebarUI();
  renderAdminNav();

  goAdmin(
    getSavedAdminTab()
  );
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
    id: 'pagos',
    label: 'Pagos'
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
    label: 'Clases y promociones'
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

function adminTabLabel(id){
  const tab =
    ADMIN_TABS.find(
      item=>item.id === id
    );

  return tab
    ? tab.label
    : 'Panel de control';
}

function updateAdminTopbar(){
  const title =
    document.getElementById(
      'admin-top-title'
    );

  if(title){
    title.textContent =
      'Panel administrador · ' +
      adminTabLabel(
        currentAdminTab
      );
  }
}

function ensureAdminSidebarUI(){

  if(
    !document.getElementById(
      'admin-sidebar-styles'
    )
  ){

    const style =
      document.createElement(
        'style'
      );

    style.id =
      'admin-sidebar-styles';

    style.textContent = `
      .admin-shell{
        display:block !important;
        grid-template-columns:none !important;
        width:100% !important;
        max-width:100% !important;
        min-height:
          calc(100vh - 65px);
      }

      .admin-main{
        width:100% !important;
        max-width:1180px !important;
        margin:0 auto !important;
        box-sizing:border-box;
      }

      .admin-top{
        position:sticky;
        top:0;
        z-index:1200;
        box-shadow:
          0 4px 18px
          rgba(20,29,39,.12);
      }

      .admin-top .wrap{
        display:flex !important;
        flex-direction:row !important;
        align-items:center !important;
        justify-content:space-between !important;
        gap:12px !important;
      }

      .admin-top .wrap >
      div:not(.brand){
        display:none !important;
      }

      .admin-top .brand{
        flex:1 1 auto;
        min-width:0;
        max-width:none;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .admin-menu-toggle{
        flex:0 0 auto;
        border:1px solid
          rgba(255,255,255,.18);
        background:
          rgba(255,255,255,.08);
        color:var(--cream);
        min-height:42px;
        padding:9px 14px;
        border-radius:9px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:8px;
        font-family:
          'Space Grotesk',
          sans-serif;
        font-size:14px;
        font-weight:600;
        cursor:pointer;
      }

      .admin-menu-toggle:hover{
        background:
          rgba(255,255,255,.14);
      }

      .admin-menu-toggle-icon{
        width:18px;
        height:14px;
        display:flex;
        flex-direction:column;
        justify-content:space-between;
      }

      .admin-menu-toggle-icon span{
        display:block;
        width:100%;
        height:2px;
        border-radius:999px;
        background:currentColor;
      }

      .admin-nav{
        position:fixed !important;
        top:0 !important;
        left:0 !important;
        bottom:0 !important;
        width:min(86vw, 310px) !important;
        max-width:310px !important;
        min-width:0 !important;
        height:100dvh !important;
        padding:0 !important;
        margin:0 !important;
        background:
          var(--asphalt-2) !important;
        z-index:3100 !important;
        transform:
          translateX(-105%);
        transition:
          transform .24s ease;
        box-shadow:
          18px 0 45px
          rgba(9,15,22,.22);
        overflow-y:auto !important;
        overscroll-behavior:contain;
        display:flex !important;
        flex-direction:column !important;
      }

      .admin-nav.open{
        transform:
          translateX(0);
      }

      .admin-menu-overlay{
        position:fixed;
        inset:0;
        z-index:3090;
        background:
          rgba(11,18,26,.58);
        backdrop-filter:
          blur(2px);
        -webkit-backdrop-filter:
          blur(2px);
        opacity:0;
        visibility:hidden;
        pointer-events:none;
        transition:
          opacity .22s ease,
          visibility .22s ease;
      }

      .admin-menu-overlay.open{
        opacity:1;
        visibility:visible;
        pointer-events:auto;
      }

      body.admin-sidebar-open{
        overflow:hidden !important;
      }

      .admin-sidebar-head{
        position:sticky;
        top:0;
        z-index:2;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        padding:20px 18px 16px;
        background:
          var(--asphalt-2);
        border-bottom:
          1px solid
          rgba(255,255,255,.10);
      }

      .admin-sidebar-title{
        color:var(--cream);
        font-family:
          'Space Grotesk',
          sans-serif;
        font-size:18px;
        font-weight:700;
      }

      .admin-sidebar-subtitle{
        margin-top:3px;
        color:
          rgba(255,255,255,.62);
        font-size:12px;
      }

      .admin-sidebar-close{
        width:38px !important;
        height:38px !important;
        min-width:38px !important;
        margin:0 !important;
        padding:0 !important;
        border-radius:9px !important;
        display:flex !important;
        align-items:center;
        justify-content:center;
        background:
          rgba(255,255,255,.08) !important;
        color:var(--cream) !important;
        font-size:23px !important;
        line-height:1 !important;
        text-align:center !important;
      }

      .admin-sidebar-items{
        padding:14px 12px;
        flex:1 1 auto;
      }

      .admin-nav
      .admin-sidebar-items
      button{
        display:flex !important;
        align-items:center;
        width:100% !important;
        min-height:44px;
        margin:0 0 5px !important;
        padding:11px 14px !important;
        border-radius:9px !important;
        text-align:left !important;
        white-space:normal !important;
        color:var(--cream-dim);
        transition:
          background .15s ease,
          color .15s ease,
          transform .15s ease;
      }

      .admin-nav
      .admin-sidebar-items
      button:hover{
        background:
          rgba(255,255,255,.07);
      }

      .admin-nav
      .admin-sidebar-items
      button.active{
        background:
          var(--amber) !important;
        color:
          var(--asphalt) !important;
        font-weight:700;
      }

      .admin-sidebar-footer{
        padding:14px 12px 18px;
        border-top:
          1px solid
          rgba(255,255,255,.10);
      }

      .admin-nav
      .admin-sidebar-footer
      button{
        width:100% !important;
        min-height:42px;
        margin:0 0 7px !important;
        padding:10px 14px !important;
        border-radius:9px !important;
        text-align:left !important;
      }

      .admin-sidebar-public{
        background:
          rgba(255,255,255,.08) !important;
        color:var(--cream) !important;
      }

      .admin-sidebar-logout{
        background:
          rgba(190,78,62,.16) !important;
        color:#ffd9d2 !important;
        border:
          1px solid
          rgba(255,185,174,.12) !important;
      }

      @media(max-width:768px){

        .admin-top .wrap{
          width:100% !important;
          padding:
            12px 14px !important;
          flex-direction:row !important;
          flex-wrap:nowrap !important;
          align-items:center !important;
          justify-content:space-between !important;
          gap:10px !important;
          box-sizing:border-box;
        }

        .admin-top .brand{
          width:auto !important;
          max-width:none !important;
          flex:1 1 auto !important;
          min-width:0 !important;
          margin:0 !important;
          font-size:14px !important;
          line-height:1.2;
          white-space:nowrap !important;
          overflow:hidden !important;
          text-overflow:ellipsis !important;
        }

        .admin-top .brand .dot{
          flex:0 0 auto;
        }

        .admin-menu-toggle{
          flex:0 0 auto !important;
          min-width:auto !important;
          width:auto !important;
          min-height:40px;
          padding:8px 12px;
          font-size:13px;
          white-space:nowrap;
        }

        .admin-main{
          padding:
            22px 14px 90px
            !important;
        }

      }
    `;

    document.head
      .appendChild(style);

  }


  if(
    !document.getElementById(
      'admin-menu-overlay'
    )
  ){

    const overlay =
      document.createElement(
        'div'
      );

    overlay.id =
      'admin-menu-overlay';

    overlay.className =
      'admin-menu-overlay';

    overlay.onclick =
      closeAdminSidebar;

    document.body
      .appendChild(overlay);

  }


  const topWrap =
    document.querySelector(
      '#admin-dashboard-screen ' +
      '.admin-top .wrap'
    );


  if(
    topWrap &&
    !document.getElementById(
      'admin-menu-toggle'
    )
  ){

    const button =
      document.createElement(
        'button'
      );

    button.id =
      'admin-menu-toggle';

    button.type =
      'button';

    button.className =
      'admin-menu-toggle';

    button.setAttribute(
      'aria-label',
      'Abrir menú del panel'
    );

    button.setAttribute(
      'aria-expanded',
      'false'
    );

    button.innerHTML = `
      <span
        class="
          admin-menu-toggle-icon
        "
        aria-hidden="true"
      >
        <span></span>
        <span></span>
        <span></span>
      </span>
      Menú
    `;

    button.onclick =
      toggleAdminSidebar;

    topWrap.appendChild(
      button
    );

  }


  if(
    !window
      .__adminSidebarEscapeBound
  ){

    document.addEventListener(
      'keydown',
      event=>{

        if(
          event.key === 'Escape'
        ){
          closeAdminSidebar();
        }

      }
    );

    window
      .__adminSidebarEscapeBound =
      true;

  }

}


function openAdminSidebar(){

  ensureAdminSidebarUI();

  const nav =
    document.getElementById(
      'admin-nav'
    );

  const overlay =
    document.getElementById(
      'admin-menu-overlay'
    );

  const toggle =
    document.getElementById(
      'admin-menu-toggle'
    );


  if(nav){
    nav.classList.add(
      'open'
    );
  }

  if(overlay){
    overlay.classList.add(
      'open'
    );
  }

  if(toggle){
    toggle.setAttribute(
      'aria-expanded',
      'true'
    );
  }

  document.body
    .classList
    .add(
      'admin-sidebar-open'
    );

}


function closeAdminSidebar(){

  const nav =
    document.getElementById(
      'admin-nav'
    );

  const overlay =
    document.getElementById(
      'admin-menu-overlay'
    );

  const toggle =
    document.getElementById(
      'admin-menu-toggle'
    );


  if(nav){
    nav.classList.remove(
      'open'
    );
  }

  if(overlay){
    overlay.classList.remove(
      'open'
    );
  }

  if(toggle){
    toggle.setAttribute(
      'aria-expanded',
      'false'
    );
  }

  document.body
    .classList
    .remove(
      'admin-sidebar-open'
    );

}


function toggleAdminSidebar(){

  const nav =
    document.getElementById(
      'admin-nav'
    );

  if(
    nav &&
    nav.classList.contains(
      'open'
    )
  ){
    closeAdminSidebar();
  }else{
    openAdminSidebar();
  }

}


function renderAdminNav(){

  ensureAdminSidebarUI();
  updateAdminTopbar();

  const nav =
    document.getElementById(
      'admin-nav'
    );

  if(!nav){
    return;
  }

  nav.innerHTML = `

    <div class="admin-sidebar-head">

      <div>
        <div class="admin-sidebar-title">
          Menú administrador
        </div>

        <div class="admin-sidebar-subtitle">
          ${escapeHTML(
            adminTabLabel(
              currentAdminTab
            )
          )}
        </div>
      </div>

      <button
        type="button"
        class="admin-sidebar-close"
        onclick="closeAdminSidebar()"
        aria-label="Cerrar menú"
      >
        ×
      </button>

    </div>


    <div class="admin-sidebar-items">

      ${ADMIN_TABS
        .map(tab=>`

          <button
            type="button"
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
        .join('')}

    </div>


    <div class="admin-sidebar-footer">

      <button
        type="button"
        class="admin-sidebar-public"
        onclick="
          closeAdminSidebar();
          closeAdmin();
        "
      >
        Ver sitio público
      </button>

      <button
        type="button"
        class="admin-sidebar-logout"
        onclick="
          closeAdminSidebar();
          logoutAdmin();
        "
      >
        Cerrar sesión
      </button>

    </div>

  `;

}

async function goAdmin(id){

  const safeId =
    ADMIN_TABS.some(
      tab=>tab.id === id
    )
      ? id
      : 'dashboard';

  currentAdminTab = safeId;

  sessionStorage.setItem(
    NAV_STATE_KEYS.adminTab,
    safeId
  );

  saveCurrentView('admin');

  renderAdminNav();
  closeAdminSidebar();
  updateAdminTopbar();

  const main =
    document.getElementById(
      'admin-main'
    );

  if(!main){
    return;
  }

  main.innerHTML = `
    <div class="admin-loading-card">
      <span class="admin-loading-dot"></span>
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

      pagos:
        renderAdminPayments,

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

    const renderFunction =
      functions[safeId] ||
      renderAdminDashboard;

    renderFunction();

    window.scrollTo({
      top:0,
      behavior:'smooth'
    });

  }catch(error){
    console.error(
      'No se pudo cargar el panel:',
      error
    );

    main.innerHTML = `
      <div class="admin-error-state">
        <strong>
          No se pudo cargar esta sección.
        </strong>
        <span>
          Revisá la conexión e intentá nuevamente.
        </span>
        <button
          type="button"
          class="mini-btn"
          onclick="goAdmin('${safeId}')"
        >
          Reintentar
        </button>
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
    (DB.bookings || [])
      .filter(
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

  const pendingBookings =
    (DB.bookings || [])
      .filter(
        booking=>
          booking.status ===
          'pending'
      );

  const pending =
    pendingBookings.length;

  const thisMonth =
    today.slice(0, 7);

  const income =
    (DB.payments || [])
      .filter(payment=>
        payment.date &&
        payment.date.slice(0, 7) ===
          thisMonth
      )
      .reduce(
        (total, payment)=>
          total + payment.amount,
        0
      );

  const pendingToCollect =
    (DB.paymentDues || [])
      .filter(item=>
        item.status === 'pending'
      )
      .reduce(
        (total, item)=>
          total + item.amount,
        0
      );

  const pendingReviews =
    (DB.reviews || [])
      .filter(
        review=>
          review.status ===
          'pending'
      ).length;

  const unreadMessages =
    (DB.messages || [])
      .filter(
        message=>!message.read
      ).length;

  const tomorrow =
    new Date();

  tomorrow.setDate(
    tomorrow.getDate() + 1
  );

  const tomorrowIso =
    toISO(tomorrow);

  const remindersList =
    confirmed
      .filter(
        booking=>
          booking.date ===
          tomorrowIso
      )
      .sort(
        (a,b)=>
          bookingEffectiveTime(a)
            .localeCompare(
              bookingEffectiveTime(b)
            )
      );

  const upcomingClasses =
    confirmed
      .filter(
        booking=>
          booking.date >= today
      )
      .sort((a,b)=>{
        const dateCompare =
          String(a.date || '')
            .localeCompare(
              String(b.date || '')
            );

        if(dateCompare !== 0){
          return dateCompare;
        }

        return (
          bookingEffectiveTime(a) ||
          '99:99'
        ).localeCompare(
          bookingEffectiveTime(b) ||
          '99:99'
        );
      })
      .slice(0, 6);

  const todayDate =
    new Date(
      today + 'T12:00:00'
    );

  const dateLabel =
    todayDate.toLocaleDateString(
      'es-AR',
      {
        weekday:'long',
        day:'numeric',
        month:'long'
      }
    );

  document
    .getElementById(
      'admin-main'
    )
    .innerHTML = `

      <div class="admin-dashboard-heading">
        <div>
          <div class="admin-dashboard-kicker">
            Resumen de hoy
          </div>

          <h2>
            Panel de control
          </h2>

          <p class="admin-dashboard-date">
            ${escapeHTML(dateLabel)}
          </p>
        </div>

        <div class="admin-status-chip">
          <span></span>
          Sistema conectado
        </div>
      </div>

      ${
        !DB.settings.whatsapp
          ? `
              <div class="admin-dashboard-alert">
                <strong>
                  Falta configurar WhatsApp.
                </strong>
                <span>
                  Cargalo en Ajustes del sitio para habilitar los accesos directos.
                </span>
                <button
                  type="button"
                  onclick="goAdmin('ajustes')"
                >
                  Ir a ajustes
                </button>
              </div>
            `
          : ''
      }

      <div class="admin-stat-grid-modern">

        <button
          type="button"
          class="admin-stat-modern"
          onclick="goAdmin('agenda')"
        >
          <span class="admin-stat-icon">HOY</span>
          <strong>${classesToday}</strong>
          <small>Clases hoy</small>
          <b>Ver agenda →</b>
        </button>

        <button
          type="button"
          class="admin-stat-modern"
          onclick="goAdmin('agenda')"
        >
          <span class="admin-stat-icon">7D</span>
          <strong>${classesWeek}</strong>
          <small>Clases próximos 7 días</small>
          <b>Ver agenda →</b>
        </button>

        <button
          type="button"
          class="admin-stat-modern ${pending ? 'attention' : ''}"
          onclick="goAdmin('agenda')"
        >
          <span class="admin-stat-icon">SOL</span>
          <strong>${pending}</strong>
          <small>Solicitudes pendientes</small>
          <b>Revisar →</b>
        </button>

        <button
          type="button"
          class="admin-stat-modern money"
          onclick="goAdmin('pagos')"
        >
          <span class="admin-stat-icon">$</span>
          <strong>${fmtMoney(income)}</strong>
          <small>Cobrado este mes</small>
          <b>Ver pagos →</b>
        </button>

        <button
          type="button"
          class="admin-stat-modern money ${pendingToCollect ? 'attention' : ''}"
          onclick="goAdmin('pagos')"
        >
          <span class="admin-stat-icon">PEN</span>
          <strong>${fmtMoney(pendingToCollect)}</strong>
          <small>Pendiente de cobro</small>
          <b>Ver saldos →</b>
        </button>

      </div>

      <div class="admin-quick-panel">
        <div class="admin-panel-title-row">
          <div>
            <span class="admin-section-kicker">
              Accesos rápidos
            </span>
            <h3>¿Qué necesitás hacer?</h3>
          </div>
        </div>

        <div class="admin-quick-grid">
          <button type="button" onclick="goAdmin('agenda')">
            <strong>Agenda</strong>
            <span>Clases y solicitudes</span>
          </button>

          <button type="button" onclick="goAdmin('alumnas')">
            <strong>Alumnas</strong>
            <span>Fichas y observaciones</span>
          </button>

          <button type="button" onclick="goAdmin('pagos')">
            <strong>Pagos</strong>
            <span>Cobros y pendientes</span>
          </button>

          <button type="button" onclick="goAdmin('precios')">
            <strong>Promociones</strong>
            <span>Contenido público</span>
          </button>

          <button type="button" onclick="goAdmin('mensajes')">
            <strong>Mensajes</strong>
            <span>${unreadMessages} sin leer</span>
          </button>

          <button type="button" onclick="goAdmin('ajustes')">
            <strong>Ajustes</strong>
            <span>Contacto y preguntas</span>
          </button>
        </div>
      </div>

      <div class="admin-dashboard-columns">

        <section class="admin-dashboard-card">
          <div class="admin-panel-title-row">
            <div>
              <span class="admin-section-kicker">
                Próximas clases
              </span>
              <h3>Agenda próxima</h3>
            </div>

            <button
              type="button"
              class="admin-text-action"
              onclick="goAdmin('agenda')"
            >
              Ver agenda
            </button>
          </div>

          ${
            upcomingClasses.length
              ? `
                  <div class="admin-upcoming-list">
                    ${upcomingClasses.map(booking=>{
                      const phone =
                        bookingCurrentPhone(
                          booking
                        );

                      const address =
                        bookingCurrentAddress(
                          booking
                        );

                      const time =
                        bookingEffectiveTime(
                          booking
                        ) || '—';

                      return `
                        <article class="admin-upcoming-item">
                          <div class="admin-upcoming-date">
                            <strong>
                              ${formatAgendaShortDate(booking.date)}
                            </strong>
                            <span>${time}</span>
                          </div>

                          <div class="admin-upcoming-copy">
                            <strong>
                              ${escapeHTML(booking.name)}
                            </strong>
                            <span>
                              ${escapeHTML(
                                labelFor(
                                  booking.service,
                                  booking.serviceName
                                )
                              )}
                            </span>
                            ${
                              address
                                ? `<small>${escapeHTML(address)}</small>`
                                : ''
                            }
                          </div>

                          ${
                            phone
                              ? `
                                  <a
                                    class="admin-icon-action"
                                    href="${waLink(
                                      phone,
                                      bookingWhatsAppText(booking)
                                    )}"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    WhatsApp
                                  </a>
                                `
                              : ''
                          }
                        </article>
                      `;
                    }).join('')}
                  </div>
                `
              : `
                  <div class="admin-empty-modern">
                    No hay clases confirmadas próximas.
                  </div>
                `
          }
        </section>

        <section class="admin-dashboard-card">
          <div class="admin-panel-title-row">
            <div>
              <span class="admin-section-kicker">
                Pendientes
              </span>
              <h3>Necesitan atención</h3>
            </div>
          </div>

          <div class="admin-pending-list">
            <button
              type="button"
              onclick="goAdmin('agenda')"
            >
              <span>Solicitudes de turno</span>
              <strong>${pending}</strong>
            </button>

            <button
              type="button"
              onclick="goAdmin('resenas')"
            >
              <span>Reseñas por moderar</span>
              <strong>${pendingReviews}</strong>
            </button>

            <button
              type="button"
              onclick="goAdmin('mensajes')"
            >
              <span>Mensajes sin leer</span>
              <strong>${unreadMessages}</strong>
            </button>
          </div>

          ${
            pendingBookings.length
              ? `
                  <div class="admin-dashboard-divider"></div>
                  <span class="admin-section-kicker">
                    Últimas solicitudes
                  </span>
                  <div class="admin-request-preview">
                    ${pendingBookings
                      .slice()
                      .sort((a,b)=>
                        String(a.createdAt || '')
                          .localeCompare(
                            String(b.createdAt || '')
                          ) * -1
                      )
                      .slice(0, 4)
                      .map(booking=>`
                        <div>
                          <span>
                            ${escapeHTML(booking.name)}
                          </span>
                          <strong>
                            ${formatAgendaShortDate(booking.date)}
                            ·
                            ${bookingEffectiveTime(booking) || 'Sin hora'}
                          </strong>
                        </div>
                      `)
                      .join('')}
                  </div>
                `
              : ''
          }
        </section>

      </div>

      <section class="admin-dashboard-card admin-reminder-card">
        <div class="admin-panel-title-row">
          <div>
            <span class="admin-section-kicker">
              Recordatorios
            </span>
            <h3>
              Clases de mañana · ${fmtDateHuman(tomorrowIso)}
            </h3>
          </div>
        </div>

        ${
          remindersList.length
            ? `
                <div class="admin-reminder-grid">
                  ${remindersList.map(booking=>{
                    const phone =
                      bookingCurrentPhone(
                        booking
                      );

                    return `
                      <article>
                        <div>
                          <strong>${escapeHTML(booking.name)}</strong>
                          <span>
                            ${bookingEffectiveTime(booking) || '—'}
                            ·
                            ${escapeHTML(
                              labelFor(
                                booking.service,
                                booking.serviceName
                              )
                            )}
                          </span>
                        </div>

                        ${
                          phone
                            ? `
                                <a
                                  class="mini-btn wa"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  href="${waLink(
                                    phone,
                                    'Hola ' +
                                    booking.name +
                                    '! Te recordamos tu clase de manejo mañana ' +
                                    fmtDateHuman(booking.date) +
                                    ' a las ' +
                                    (bookingEffectiveTime(booking) || '') +
                                    '. ¡Te esperamos!'
                                  )}"
                                >
                                  Enviar WhatsApp
                                </a>
                              `
                            : `
                                <span class="admin-no-phone">
                                  Sin teléfono
                                </span>
                              `
                        }
                      </article>
                    `;
                  }).join('')}
                </div>
              `
            : `
                <div class="admin-empty-modern">
                  No hay clases confirmadas para mañana.
                </div>
              `
        }
      </section>
    `;
}

function labelFor(
  serviceKey,
  fallbackName=''
){

  const service =
    DB.services.find(
      item=>item.id === serviceKey
    );

  if(service){
    return service.name;
  }

  if(fallbackName){
    return fallbackName;
  }

  return serviceKey || 'Clase';
}

/* ==================================================================
   ADMINISTRADOR: AGENDA
   ================================================================== */

let adminMonthOffset = 0;
let adminSelectedDate = null;

const FULL_DOW = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado'
];


/* ================================================================
   HORARIOS HABITUALES
   ================================================================ */

function weeklyRangesForDay(day){

  return (
    DB.weeklyAvailability || []
  )
    .filter(item=>
      item.dayOfWeek === day
    )
    .sort((a,b)=>
      a.startTime.localeCompare(
        b.startTime
      )
    );
}

function renderWeeklySchedule(){

  return FULL_DOW.map(
    (dayName, dayNumber)=>{

      const ranges =
        weeklyRangesForDay(
          dayNumber
        );

      return `
        <div
          class="panel"
          style="
            margin-bottom:12px;
            padding:16px;
          "
        >

          <h4
            style="
              margin-top:0;
              margin-bottom:10px;
            "
          >
            ${dayName}
          </h4>


          ${
            ranges.length

              ? `
                  <div
                    class="slot-list"
                    style="
                      margin-bottom:12px;
                    "
                  >

                    ${ranges.map(range=>`

                      <span
                        class="slot-btn"
                        style="
                          display:inline-flex;
                          align-items:center;
                          gap:8px;
                        "
                      >

                        ${range.startTime}
                        -
                        ${range.endTime}

                        <button
                          class="tag-del"
                          title="Eliminar rango"
                          onclick="
                            removeWeeklyRange(
                              '${range.id}'
                            )
                          "
                        >
                          ✕
                        </button>

                      </span>

                    `).join('')}

                  </div>
                `

              : `
                  <p class="note">
                    No trabaja este día.
                  </p>
                `
          }


          <div class="inline-form">

            <div class="f">

              <label>
                Desde
              </label>

              <input
                type="time"
                id="weekly-start-${dayNumber}"
              >

            </div>


            <div class="f">

              <label>
                Hasta
              </label>

              <input
                type="time"
                id="weekly-end-${dayNumber}"
              >

            </div>


            <button
              class="mini-btn"
              onclick="
                addWeeklyRange(
                  ${dayNumber}
                )
              "
            >
              Agregar rango
            </button>

          </div>

        </div>
      `;
    }
  ).join('');
}

async function addWeeklyRange(
  dayNumber
){

  const startInput =
    document.getElementById(
      'weekly-start-' +
      dayNumber
    );

  const endInput =
    document.getElementById(
      'weekly-end-' +
      dayNumber
    );

  const startTime =
    startInput.value;

  const endTime =
    endInput.value;


  if(
    !startTime ||
    !endTime
  ){
    alert(
      'Elegí la hora de inicio y la hora de finalización.'
    );

    return;
  }


  if(
    timeToMinutes(endTime) <=
    timeToMinutes(startTime)
  ){
    alert(
      'La hora final tiene que ser posterior a la hora de inicio.'
    );

    return;
  }


  try{

    const { error } =
      await supabaseClient

        .from(
          'weekly_availability'
        )

        .insert({

          day_of_week:
            dayNumber,

          start_time:
            startTime,

          end_time:
            endTime

        });


    if(
      error &&
      error.code !== '23505'
    ){
      throw error;
    }


    await loadAdminData();

    renderAdminAgenda();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo agregar el horario habitual.'
    );

  }
}

async function removeWeeklyRange(id){

  if(
    !(
      await openAppConfirm(
        '¿Querés eliminar este rango horario?',
        {
          title:'Eliminar horario',
          confirmText:'Eliminar'
        }
      )
    )
  ){
    return;
  }


  try{

    const { error } =
      await supabaseClient

        .from(
          'weekly_availability'
        )

        .delete()

        .eq(
          'id',
          id
        );


    if(error){
      throw error;
    }


    await loadAdminData();

    renderAdminAgenda();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo eliminar el horario habitual.'
    );

  }
}


/* ================================================================
   RESUMEN MENSUAL DE CLASES CONFIRMADAS
   ================================================================ */

function adminViewedMonthInfo(){

  const {
    year,
    month
  } = monthGridDates(
    adminMonthOffset
  );

  return {
    year,
    month,
    monthName:
      MONTHS[month]
  };
}


function formatAgendaShortDate(
  iso
){

  if(!iso){
    return '—';
  }

  const [
    year,
    month,
    day
  ] = iso.split('-');

  return (
    day +
    '/' +
    month +
    '/' +
    year
  );
}


function monthlyConfirmedBookings(){

  const {
    year,
    month
  } = adminViewedMonthInfo();

  const monthPrefix =
    year +
    '-' +
    String(
      month + 1
    ).padStart(
      2,
      '0'
    ) +
    '-';

  return (
    DB.bookings || []
  )
    .filter(
      booking=>
        booking.status ===
          'confirmed' &&
        String(
          booking.date || ''
        ).startsWith(
          monthPrefix
        )
    )
    .sort(
      (a,b)=>{

        const dateCompare =
          String(
            a.date || ''
          ).localeCompare(
            String(
              b.date || ''
            )
          );

        if(dateCompare !== 0){
          return dateCompare;
        }

        return (
          bookingEffectiveTime(
            a
          ) || '99:99'
        ).localeCompare(
          bookingEffectiveTime(
            b
          ) || '99:99'
        );
      }
    );
}


function monthlyAttendanceLabel(
  booking
){

  if(
    booking.attendanceStatus ===
      'completed'
  ){
    return 'Realizada';
  }

  if(
    booking.attendanceStatus ===
      'not_completed'
  ){
    return 'No realizada';
  }

  return 'Pendiente';
}


function monthlyAttendanceClass(
  booking
){

  if(
    booking.attendanceStatus ===
      'completed'
  ){
    return 'confirmed';
  }

  if(
    booking.attendanceStatus ===
      'not_completed'
  ){
    return 'cancelled';
  }

  return 'pending';
}


function renderMonthlyConfirmedClasses(){

  const container =
    document.getElementById(
      'admin-monthly-classes'
    );

  if(!container){
    return;
  }


  const {
    monthName,
    year
  } = adminViewedMonthInfo();


  const bookings =
    monthlyConfirmedBookings();


  const completedCount =
    bookings.filter(
      booking=>
        booking.attendanceStatus ===
          'completed'
    ).length;


  const notCompletedCount =
    bookings.filter(
      booking=>
        booking.attendanceStatus ===
          'not_completed'
    ).length;


  const pendingCount =
    bookings.length -
    completedCount -
    notCompletedCount;


  container.innerHTML = `

    <div
      style="
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:16px;
        flex-wrap:wrap;
        margin-bottom:16px;
      "
    >

      <div>

        <h3
          style="
            margin-bottom:6px;
          "
        >
          Clases confirmadas de
          ${monthName} ${year}
        </h3>

        <p
          class="note"
          style="margin:0;"
        >
          ${
            bookings.length
          }
          clase${
            bookings.length === 1
              ? ''
              : 's'
          } confirmada${
            bookings.length === 1
              ? ''
              : 's'
          }

          · ${completedCount}
          realizada${
            completedCount === 1
              ? ''
              : 's'
          }

          · ${pendingCount}
          pendiente${
            pendingCount === 1
              ? ''
              : 's'
          }

          ${
            notCompletedCount
              ? `
                  · ${notCompletedCount}
                  no realizada${
                    notCompletedCount === 1
                      ? ''
                      : 's'
                  }
                `
              : ''
          }
        </p>

      </div>

    </div>


    ${
      bookings.length

        ? `

            <div class="table-scroll">

              <table class="admin-table">

                <tr>
                  <th>Fecha</th>
                  <th>Hora</th>
                  <th>Alumna</th>
                  <th>Clase</th>
                  <th>Asistencia</th>
                  <th></th>
                </tr>


                ${bookings.map(
                  booking=>{

                    const phone =
                      bookingCurrentPhone(
                        booking
                      );

                    const time =
                      bookingEffectiveTime(
                        booking
                      ) || '—';

                    return `

                      <tr>

                        <td>
                          ${
                            formatAgendaShortDate(
                              booking.date
                            )
                          }
                        </td>


                        <td class="mono">
                          ${time}
                        </td>


                        <td>

                          <strong>
                            ${
                              escapeHTML(
                                booking.name
                              )
                            }
                          </strong>

                          ${
                            phone
                              ? `
                                  <br>
                                  <span class="note">
                                    ${
                                      escapeHTML(
                                        phone
                                      )
                                    }
                                  </span>
                                `
                              : ''
                          }

                          ${
                            bookingCurrentAddress(
                              booking
                            )
                              ? `
                                  <br>
                                  <span class="note">
                                    Domicilio:
                                    ${
                                      escapeHTML(
                                        bookingCurrentAddress(
                                          booking
                                        )
                                      )
                                    }
                                  </span>
                                `
                              : ''
                          }

                        </td>


                        <td>
                          ${
                            escapeHTML(
                              labelFor(
                                booking.service,
                                booking.serviceName
                              )
                            )
                          }
                        </td>


                        <td>

                          <span
                            class="
                              pill
                              ${
                                monthlyAttendanceClass(
                                  booking
                                )
                              }
                            "
                          >
                            ${
                              monthlyAttendanceLabel(
                                booking
                              )
                            }
                          </span>

                        </td>


                        <td class="btnrow">

                          ${
                            phone

                              ? `
                                  <a
                                    class="mini-btn wa"
                                    target="_blank"
                                    rel="
                                      noopener noreferrer
                                    "
                                    href="${
                                      waLink(
                                        phone,
                                        (
                                          'Hola ' +
                                          booking.name +
                                          '! Te escribimos por tu clase de manejo del ' +
                                          fmtDateHuman(
                                            booking.date
                                          ) +
                                          ' a las ' +
                                          time +
                                          '.'
                                        )
                                      )
                                    }"
                                  >
                                    WhatsApp
                                  </a>
                                `

                              : ''
                          }

                        </td>

                      </tr>

                    `;
                  }
                ).join('')}

              </table>

            </div>

          `

        : `

            <div class="empty">
              No hay clases confirmadas
              para ${monthName} ${year}.
            </div>

          `
    }

  `;

}


/* ================================================================
   AGENDA PRINCIPAL
   ================================================================ */

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
        Consultá las clases del mes,
        administrá solicitudes y agregá
        clases manualmente.
        Al final podés configurar
        los horarios habituales.
      </p>


      <div class="panel">

        <h3>
          Agenda por fecha
        </h3>

        <p class="note">
          Elegí un día para ver solicitudes,
          clases, horarios especiales
          o agregar una clase manualmente.
          En el panel también podés abrir
          fechas anteriores para consultar
          las clases ya registradas.
        </p>

        <div
          class="booking-grid"
          style="margin-top:18px;"
        >

          <div
            class="cal"
            id="cal-admin"
          ></div>

          <div
            class="slot-panel"
            id="admin-day-panel"
          ></div>

        </div>

      </div>


      <div
        class="panel"
        id="admin-monthly-classes"
      ></div>


      <div class="panel">

        <h3>
          Horarios habituales
        </h3>

        <p class="note">
          Podés agregar más de un rango
          para el mismo día.
          Por ejemplo:
          09:00 - 12:00 y
          16:00 - 20:00.
          El horario final también puede
          elegirse como inicio de una clase.
        </p>

        <div
          style="
            margin-top:18px;
          "
        >
          ${renderWeeklySchedule()}
        </div>

      </div>

    `;


  drawAdminCalendar();
}

function drawAdminCalendar(){

  buildCalendar(
    'cal-admin',
    adminMonthOffset,
    {

      onNav:delta=>{

        adminMonthOffset +=
          delta;

        drawAdminCalendar();
      },

      onPick:iso=>{

        adminSelectedDate =
          iso;

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

  renderMonthlyConfirmedClasses();
}

/* ================================================================
   HORARIOS ESPECIALES POR FECHA
   ================================================================ */

function overridesForDate(iso){

  return (
    DB.dateOverrides || []
  )
    .filter(item=>
      item.date === iso
    )
    .sort((a,b)=>
      a.startTime.localeCompare(
        b.startTime
      )
    );
}

function habitualRangesForDate(iso){

  const date =
    new Date(
      iso + 'T12:00:00'
    );

  return weeklyRangesForDay(
    date.getDay()
  );
}

async function addDateOverride(iso){

  const startInput =
    document.getElementById(
      'override-start'
    );

  const endInput =
    document.getElementById(
      'override-end'
    );


  const startTime =
    startInput.value;

  const endTime =
    endInput.value;


  if(
    !startTime ||
    !endTime
  ){
    alert(
      'Elegí la hora de inicio y finalización.'
    );

    return;
  }


  if(
    timeToMinutes(endTime) <=
    timeToMinutes(startTime)
  ){
    alert(
      'La hora final tiene que ser posterior a la inicial.'
    );

    return;
  }


  try{

    const { error } =
      await supabaseClient

        .from(
          'date_availability_overrides'
        )

        .insert({

          class_date:
            iso,

          start_time:
            startTime,

          end_time:
            endTime

        });


    if(
      error &&
      error.code !== '23505'
    ){
      throw error;
    }


    await loadAdminData();

    renderAdminDayPanel();

    drawAdminCalendar();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo agregar el horario especial.'
    );

  }
}

async function removeDateOverride(id){

  try{

    const { error } =
      await supabaseClient

        .from(
          'date_availability_overrides'
        )

        .delete()

        .eq(
          'id',
          id
        );


    if(error){
      throw error;
    }


    await loadAdminData();

    renderAdminDayPanel();

    drawAdminCalendar();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo eliminar el horario especial.'
    );

  }
}

async function clearDateOverrides(iso){

  if(
    !(
      await openAppConfirm(
        '¿Querés volver al horario habitual para este día?',
        {
          title:'Restaurar horario',
          confirmText:'Restaurar',
          danger:false
        }
      )
    )
  ){
    return;
  }


  try{

    const { error } =
      await supabaseClient

        .from(
          'date_availability_overrides'
        )

        .delete()

        .eq(
          'class_date',
          iso
        );


    if(error){
      throw error;
    }


    await loadAdminData();

    renderAdminDayPanel();

    drawAdminCalendar();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudieron quitar los horarios especiales.'
    );

  }
}

/* ================================================================
   BLOQUEAR DÍA
   ================================================================ */

async function toggleBlockDay(
  iso,
  value
){

  try{

    let result;


    if(value){

      result =
        await supabaseClient

          .from(
            'blocked_days'
          )

          .upsert({

            class_date:
              iso,

            reason:
              ''

          });

    }else{

      result =
        await supabaseClient

          .from(
            'blocked_days'
          )

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

/* ================================================================
   CLASE MANUAL
   ================================================================ */

async function addManualClass(iso){

  const studentId =
    document
      .getElementById(
        'manual-student'
      )
      .value;


  const serviceId =
    document
      .getElementById(
        'manual-service'
      )
      .value;


  const time =
    document
      .getElementById(
        'manual-time'
      )
      .value;


  const note =
    document
      .getElementById(
        'manual-note'
      )
      .value
      .trim();


  const student =
    DB.students.find(
      item=>
        item.id ===
        studentId
    );


  const service =
    DB.services.find(
      item=>
        item.id ===
        serviceId
    );


  if(!student){

    alert(
      'Elegí una alumna.'
    );

    return;
  }


  if(!service){

    alert(
      'Elegí una clase.'
    );

    return;
  }


  if(!time){

    alert(
      'Elegí el horario de la clase.'
    );

    return;
  }


  const occupied =
  isTimeOccupied(
    iso,
    time
  );


  if(occupied){

    alert(
      'Ese horario ya tiene una clase o solicitud activa.'
    );

    return;
  }


  try{

    const { error } =
      await supabaseClient

        .from('bookings')

        .insert({

          class_date:
            iso,

          class_time:
            time,

          student_id:
            student.id,

          student_name:
            student.name,

          phone:
            student.phone || '',

          service_id:
            service.id,

          service_name:
            service.name,

          booking_source:
            'manual',

          admin_note:
            note,

          status:
            'confirmed',

          attendance_status:
            'scheduled'

        });


    if(error){
      throw error;
    }


    await loadAdminData();

    renderAdminDayPanel();

    drawAdminCalendar();


  }catch(error){

    if(
      error.code === '23505'
    ){

      alert(
        'Ese horario ya está ocupado.'
      );

      return;
    }


    showDatabaseError(
      error,
      'No se pudo agregar la clase.'
    );

  }
}

/* ================================================================
   MODALES GENERALES DEL SISTEMA
   ================================================================ */

function ensureSystemModalStyles(){

  if(
    document.getElementById(
      'system-modal-styles'
    )
  ){
    return;
  }

  const style =
    document.createElement('style');

  style.id =
    'system-modal-styles';

  style.textContent = `
    .system-modal-overlay{
      position:fixed;
      inset:0;
      z-index:120000;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
      background:rgba(8,18,34,.68);
      backdrop-filter:blur(4px);
      -webkit-backdrop-filter:blur(4px);
      animation:systemModalFadeIn .16s ease-out;
    }

    .system-modal-card{
      width:min(100%,470px);
      max-height:calc(100dvh - 40px);
      overflow:auto;
      border:1px solid rgba(18,35,63,.10);
      border-radius:20px;
      background:var(--paper,#fff);
      box-shadow:0 28px 80px rgba(6,17,31,.30);
      animation:systemModalCardIn .18s ease-out;
    }

    .system-modal-top{
      display:flex;
      align-items:flex-start;
      gap:14px;
      padding:22px 22px 0;
    }

    .system-modal-icon{
      display:grid;
      flex:0 0 44px;
      width:44px;
      height:44px;
      place-items:center;
      border-radius:14px;
      background:rgba(245,160,39,.15);
      color:var(--orange-dark,#d68100);
      font-family:'Space Grotesk',sans-serif;
      font-size:22px;
      font-weight:800;
      line-height:1;
    }

    .system-modal-icon.danger{
      background:rgba(190,63,58,.12);
      color:#a5322e;
    }

    .system-modal-heading{
      min-width:0;
      flex:1 1 auto;
    }

    .system-modal-title{
      margin:1px 0 5px;
      color:var(--navy,#12233f);
      font-family:'Space Grotesk',sans-serif;
      font-size:21px;
      font-weight:750;
      line-height:1.18;
    }

    .system-modal-kicker{
      color:var(--orange-dark,#d68100);
      font-family:'Space Grotesk',sans-serif;
      font-size:11px;
      font-weight:750;
      letter-spacing:.12em;
      text-transform:uppercase;
    }

    .system-modal-message{
      padding:18px 22px 8px;
      color:var(--ink-soft,#536174);
      font-family:'Space Grotesk',sans-serif;
      font-size:15px;
      line-height:1.58;
      white-space:pre-wrap;
      overflow-wrap:anywhere;
    }

    .system-modal-actions{
      display:flex;
      justify-content:flex-end;
      gap:10px;
      padding:18px 22px 22px;
      border-top:1px solid rgba(18,35,63,.08);
      margin-top:10px;
    }

    .system-modal-btn{
      min-height:42px;
      padding:10px 17px;
      border-radius:11px;
      border:1px solid transparent;
      font-family:'Space Grotesk',sans-serif;
      font-size:14px;
      font-weight:750;
      cursor:pointer;
      transition:
        transform .14s ease,
        box-shadow .14s ease,
        background .14s ease;
    }

    .system-modal-btn:hover{
      transform:translateY(-1px);
    }

    .system-modal-btn.cancel{
      border-color:rgba(18,35,63,.14);
      background:#fff;
      color:var(--navy,#12233f);
    }

    .system-modal-btn.primary{
      background:var(--orange,#f5a027);
      color:var(--navy,#12233f);
      box-shadow:0 7px 18px rgba(245,160,39,.22);
    }

    .system-modal-btn.danger{
      background:#a83b36;
      color:#fff;
      box-shadow:0 7px 18px rgba(168,59,54,.20);
    }

    .system-modal-btn:focus-visible{
      outline:3px solid rgba(245,160,39,.30);
      outline-offset:2px;
    }

    @keyframes systemModalFadeIn{
      from{opacity:0;}
      to{opacity:1;}
    }

    @keyframes systemModalCardIn{
      from{
        opacity:0;
        transform:translateY(8px) scale(.985);
      }
      to{
        opacity:1;
        transform:translateY(0) scale(1);
      }
    }

    @media(max-width:560px){
      .system-modal-overlay{
        padding:14px;
      }

      .system-modal-card{
        border-radius:17px;
      }

      .system-modal-top{
        padding:19px 18px 0;
      }

      .system-modal-message{
        padding:16px 18px 7px;
        font-size:14px;
      }

      .system-modal-actions{
        padding:16px 18px 18px;
      }

      .system-modal-title{
        font-size:19px;
      }

      .system-modal-icon{
        flex-basis:40px;
        width:40px;
        height:40px;
        border-radius:12px;
        font-size:20px;
      }
    }

    @media(max-width:390px){
      .system-modal-actions{
        display:grid;
        grid-template-columns:1fr;
      }

      .system-modal-btn{
        width:100%;
      }

      .system-modal-btn.primary,
      .system-modal-btn.danger{
        order:-1;
      }
    }
  `;

  document.head.appendChild(style);
}


function systemModalIsDanger(message){

  const text =
    String(message || '')
      .toLowerCase();

  return (
    text.includes('eliminar') ||
    text.includes('quitar') ||
    text.includes('borrar')
  );
}


function closePreviousSystemModal(){

  const previous =
    document.getElementById(
      'system-modal-overlay'
    );

  if(previous){
    previous.remove();
  }
}


function showAppAlert(
  message,
  {
    title = 'Aviso',
    buttonText = 'Aceptar'
  } = {}
){

  ensureSystemModalStyles();
  closePreviousSystemModal();

  const overlay =
    document.createElement('div');

  overlay.id =
    'system-modal-overlay';

  overlay.className =
    'system-modal-overlay';

  overlay.setAttribute(
    'role',
    'alertdialog'
  );

  overlay.setAttribute(
    'aria-modal',
    'true'
  );

  overlay.innerHTML = `
    <div
      class="system-modal-card"
      role="document"
    >
      <div class="system-modal-top">
        <div
          class="system-modal-icon"
          aria-hidden="true"
        >
          i
        </div>

        <div class="system-modal-heading">
          <div class="system-modal-kicker">
            Escuela de Manejo
          </div>

          <h3 class="system-modal-title">
            ${escapeHTML(title)}
          </h3>
        </div>
      </div>

      <div class="system-modal-message">${
        escapeHTML(
          String(message ?? '')
        )
      }</div>

      <div class="system-modal-actions">
        <button
          type="button"
          class="system-modal-btn primary"
          id="system-modal-ok"
        >
          ${escapeHTML(buttonText)}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(
    overlay
  );

  const okButton =
    document.getElementById(
      'system-modal-ok'
    );

  const close = ()=>{

    document.removeEventListener(
      'keydown',
      onKeyDown
    );

    if(overlay.isConnected){
      overlay.remove();
    }
  };

  const onKeyDown = event=>{

    if(
      event.key === 'Escape' ||
      event.key === 'Enter'
    ){
      event.preventDefault();
      close();
    }
  };

  document.addEventListener(
    'keydown',
    onKeyDown
  );

  okButton.onclick =
    close;

  overlay.addEventListener(
    'click',
    event=>{
      if(event.target === overlay){
        close();
      }
    }
  );

  setTimeout(
    ()=>okButton.focus(),
    30
  );
}


function openAppConfirm(
  message,
  {
    title = 'Confirmar acción',
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    danger = null
  } = {}
){

  return new Promise(resolve=>{

    ensureSystemModalStyles();
    closePreviousSystemModal();

    const isDanger =
      danger === null
        ? systemModalIsDanger(
            message
          )
        : Boolean(danger);

    const overlay =
      document.createElement('div');

    overlay.id =
      'system-modal-overlay';

    overlay.className =
      'system-modal-overlay';

    overlay.setAttribute(
      'role',
      'dialog'
    );

    overlay.setAttribute(
      'aria-modal',
      'true'
    );

    overlay.innerHTML = `
      <div
        class="system-modal-card"
        role="document"
      >
        <div class="system-modal-top">
          <div
            class="
              system-modal-icon
              ${isDanger ? 'danger' : ''}
            "
            aria-hidden="true"
          >
            ${isDanger ? '!' : '?'}
          </div>

          <div class="system-modal-heading">
            <div class="system-modal-kicker">
              Escuela de Manejo
            </div>

            <h3 class="system-modal-title">
              ${escapeHTML(title)}
            </h3>
          </div>
        </div>

        <div class="system-modal-message">${
          escapeHTML(
            String(message ?? '')
          )
        }</div>

        <div class="system-modal-actions">
          <button
            type="button"
            class="system-modal-btn cancel"
            id="system-modal-cancel"
          >
            ${escapeHTML(cancelText)}
          </button>

          <button
            type="button"
            class="
              system-modal-btn
              ${isDanger ? 'danger' : 'primary'}
            "
            id="system-modal-confirm"
          >
            ${escapeHTML(confirmText)}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(
      overlay
    );

    const cancelButton =
      document.getElementById(
        'system-modal-cancel'
      );

    const confirmButton =
      document.getElementById(
        'system-modal-confirm'
      );

    let finished = false;

    const close = value=>{

      if(finished){
        return;
      }

      finished = true;

      document.removeEventListener(
        'keydown',
        onKeyDown
      );

      if(overlay.isConnected){
        overlay.remove();
      }

      resolve(value);
    };

    const onKeyDown = event=>{

      if(event.key === 'Escape'){
        event.preventDefault();
        close(false);
      }
    };

    document.addEventListener(
      'keydown',
      onKeyDown
    );

    cancelButton.onclick =
      ()=>close(false);

    confirmButton.onclick =
      ()=>close(true);

    overlay.addEventListener(
      'click',
      event=>{
        if(event.target === overlay){
          close(false);
        }
      }
    );

    setTimeout(
      ()=>confirmButton.focus(),
      30
    );
  });
}


/*
  Los avisos existentes usan automáticamente
  el modal del sistema en vez del cuadro del navegador.
*/
window.alert =
  function(message){
    showAppAlert(message);
  };


/* ================================================================
   MODAL GENÉRICO PARA MODIFICACIONES
   ================================================================ */

function openEditModal({
  title = 'Modificar',
  label = '',
  value = '',
  inputType = 'text',
  textarea = false,
  placeholder = '',
  confirmText = 'Guardar cambios',
  formatMoney = false
} = {}){

  return new Promise(resolve=>{

    const previousModal =
      document.getElementById(
        'app-edit-modal'
      );

    if(previousModal){
      previousModal.remove();
    }


    const overlay =
      document.createElement('div');

    overlay.id =
      'app-edit-modal';

    overlay.setAttribute(
      'role',
      'dialog'
    );

    overlay.setAttribute(
      'aria-modal',
      'true'
    );

    overlay.style.cssText = `
      position:fixed;
      inset:0;
      z-index:99999;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
      background:rgba(8, 16, 28, .66);
      backdrop-filter:blur(4px);
    `;


    const card =
      document.createElement('div');

    card.style.cssText = `
      width:min(100%, 460px);
      max-height:calc(100vh - 40px);
      overflow:auto;
      border:1px solid var(--line, #d8d8d8);
      border-radius:18px;
      background:var(--paper, #fff);
      color:var(--ink, #1f2937);
      box-shadow:0 24px 70px rgba(0, 0, 0, .32);
      padding:22px;
    `;


    const heading =
      document.createElement('h3');

    heading.textContent = title;

    heading.style.cssText = `
      margin:0 0 18px;
      font-size:22px;
      line-height:1.2;
    `;

    card.appendChild(heading);


    if(label){

      const labelElement =
        document.createElement('label');

      labelElement.textContent = label;

      labelElement.style.cssText = `
        display:block;
        margin-bottom:8px;
        font-size:14px;
        font-weight:700;
      `;

      card.appendChild(labelElement);

    }


    const field = textarea
      ? document.createElement('textarea')
      : document.createElement('input');

    if(!textarea){
      field.type = inputType;
    }

    field.value =
      String(value ?? '');

    field.placeholder =
      placeholder;

    field.style.cssText = `
      width:100%;
      box-sizing:border-box;
      min-height:${textarea ? '130px' : '48px'};
      resize:${textarea ? 'vertical' : 'none'};
      border:1px solid var(--line, #cbd5e1);
      border-radius:12px;
      background:var(--cream-dim, #f8fafc);
      color:var(--ink, #1f2937);
      font:inherit;
      font-size:16px;
      padding:12px 14px;
      outline:none;
    `;

    if(formatMoney){

      field.inputMode =
        'decimal';

      field.addEventListener(
        'input',
        ()=>{
          field.value =
            formatMoneyInputValue(
              field.value
            );
        }
      );

    }

    card.appendChild(field);


    const actions =
      document.createElement('div');

    actions.style.cssText = `
      display:flex;
      justify-content:flex-end;
      gap:10px;
      margin-top:20px;
      flex-wrap:wrap;
    `;


    const cancelButton =
      document.createElement('button');

    cancelButton.type = 'button';
    cancelButton.className = 'mini-btn';
    cancelButton.textContent = 'Cancelar';


    const confirmButton =
      document.createElement('button');

    confirmButton.type = 'button';
    confirmButton.className = 'mini-btn ok';
    confirmButton.textContent =
      confirmText;


    actions.appendChild(
      cancelButton
    );

    actions.appendChild(
      confirmButton
    );

    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);


    const closeModal = value=>{

      document.removeEventListener(
        'keydown',
        onKeyDown
      );

      overlay.remove();
      resolve(value);

    };


    const submitModal = ()=>{
      closeModal(field.value);
    };


    const onKeyDown = event=>{

      if(event.key === 'Escape'){
        event.preventDefault();
        closeModal(null);
        return;
      }

      if(
        event.key === 'Enter' &&
        !textarea
      ){
        event.preventDefault();
        submitModal();
      }

    };


    document.addEventListener(
      'keydown',
      onKeyDown
    );

    cancelButton.addEventListener(
      'click',
      ()=>closeModal(null)
    );

    confirmButton.addEventListener(
      'click',
      submitModal
    );

    overlay.addEventListener(
      'click',
      event=>{
        if(event.target === overlay){
          closeModal(null);
        }
      }
    );

    field.addEventListener(
      'focus',
      ()=>{
        field.style.borderColor =
          'var(--amber, #E8A33D)';
      }
    );

    field.addEventListener(
      'blur',
      ()=>{
        field.style.borderColor =
          'var(--line, #cbd5e1)';
      }
    );


    setTimeout(
      ()=>{
        field.focus();

        if(
          !textarea &&
          inputType !== 'time'
        ){
          field.select();
        }
      },
      0
    );

  });

}


/* ================================================================
   CAMBIAR HORARIO
   ================================================================ */

async function changeBookingTime(id){

  const booking =
    DB.bookings.find(
      item=>item.id === id
    );


  if(!booking){
    return;
  }


  const newTime =
    await openEditModal({
      title:
        'Cambiar horario',
      label:
        'Nuevo horario de la clase',
      value:
        booking.time ||
        booking.preferredTime ||
        '',
      inputType:
        'time',
      confirmText:
        'Guardar horario'
    });


  if(newTime === null){
    return;
  }


  const cleanTime =
    newTime.trim();


  if(
    !/^([01]\d|2[0-3]):[0-5]\d$/
      .test(cleanTime)
  ){

    alert(
      'Ingresá el horario en formato HH:MM. Ejemplo: 10:20'
    );

    return;
  }


  const occupied =
  DB.bookings.some(
    item=>
      item.id !== id &&
      item.date ===
        booking.date &&
      item.time ===
        cleanTime &&
      bookingOccupiesSlot(
        item
      )
  );


  if(occupied){

    alert(
      'Ese horario ya está ocupado.'
    );

    return;
  }


  try{

    const { error } =
      await supabaseClient

        .from('bookings')

        .update({

          class_time:
            cleanTime,

          updated_at:
            new Date()
              .toISOString()

        })

        .eq(
          'id',
          id
        );


    if(error){
      throw error;
    }


    await loadAdminData();

    renderAdminDayPanel();

    drawAdminCalendar();


  }catch(error){

    if(
      error.code === '23505'
    ){

      alert(
        'Ese horario ya está ocupado.'
      );

      return;
    }


    showDatabaseError(
      error,
      'No se pudo cambiar el horario.'
    );

  }
}

/* ================================================================
   ESTADO DE RESERVA
   ================================================================ */

async function setBookingStatus(
  id,
  status
){

  const booking =
    DB.bookings.find(
      item=>
        item.id === id
    );


  if(!booking){
    return;
  }


  const updateData = {

    status,

    updated_at:
      new Date()
        .toISOString()

  };


  /*
    Si es una solicitud con horario
    preferido y se confirma, ese horario
    pasa a ser el horario real.
  */

  if(
    status === 'confirmed' &&
    !booking.time
  ){

    if(
      !booking.preferredTime
    ){

      alert(
        'Esta solicitud no tiene un horario definido.'
      );

      return;
    }


    const occupied =
      DB.bookings.some(
        item=>

          item.id !== id &&

          item.date ===
            booking.date &&

          item.time ===
            booking.preferredTime &&

          (
            item.status ===
              'pending' ||

            item.status ===
              'confirmed'
          )
      );


    if(occupied){

      alert(
        'El horario preferido ya está ocupado. Cambiá el horario antes de confirmar.'
      );

      return;
    }


    updateData.class_time =
      booking.preferredTime;

  }


  try{

    const { error } =
      await supabaseClient

        .from('bookings')

        .update(
          updateData
        )

        .eq(
          'id',
          id
        );


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

/* ================================================================
   ASISTENCIA / CLASE REALIZADA
   ================================================================ */

async function setBookingAttendance(
  id,
  attendanceStatus
){

  try{

    const { error } =
      await supabaseClient

        .from('bookings')

        .update({

          attendance_status:
            attendanceStatus,

          updated_at:
            new Date()
              .toISOString()

        })

        .eq(
          'id',
          id
        );


    if(error){
      throw error;
    }


    await loadAdminData();

    renderAdminDayPanel();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo actualizar la asistencia.'
    );

  }
}

/* ================================================================
   PANEL DEL DÍA
   ================================================================ */

let showClosedBookings = false;


function toggleClosedBookings(){

  showClosedBookings =
    !showClosedBookings;

  renderAdminDayPanel();
}


function bookingStatusLabel(status){

  if(status === 'pending'){
    return 'Pendiente';
  }

  if(status === 'confirmed'){
    return 'Confirmada';
  }

  if(status === 'rejected'){
    return 'Rechazada';
  }

  if(status === 'cancelled'){
    return 'Cancelada';
  }

  return status;
}


function bookingStatusClass(status){

  if(status === 'confirmed'){
    return 'confirmed';
  }

  if(
    status === 'rejected' ||
    status === 'cancelled'
  ){
    return 'cancelled';
  }

  return 'pending';
}

function bookingCurrentPhone(
  booking
){

  if(
    booking &&
    booking.studentId
  ){

    const student =
      DB.students.find(
        item=>
          item.id ===
            booking.studentId
      );


    if(
      student &&
      student.phone
    ){
      return student.phone;
    }

  }


  return booking?.phone || '';

}



function bookingCurrentAddress(
  booking
){
  if(
    booking &&
    booking.studentId
  ){
    const student =
      DB.students.find(
        item=>
          item.id === booking.studentId
      );

    if(
      student &&
      student.address
    ){
      return student.address;
    }
  }

  return (
    booking &&
    booking.address
      ? booking.address
      : ''
  );
}


function bookingWhatsAppText(
  booking
){

  let timeMessage =
    '';


  if(
    booking.preferredTime
  ){

    if(
      booking.time &&
      booking.time !==
        booking.preferredTime
    ){

      timeMessage =
        ' Nos indicaste como horario preferido las ' +
        booking.preferredTime +
        ', y el horario que estamos coordinando es a las ' +
        booking.time +
        '.';

    }else{

      timeMessage =
        ' Nos indicaste como horario preferido las ' +
        booking.preferredTime +
        '.';

    }

  }else if(
    booking.time
  ){

    timeMessage =
      ' Elegiste el horario de las ' +
      booking.time +
      '.';

  }


  return (
    'Hola ' +
    booking.name +
    '! Te escribimos por tu solicitud de clase de manejo para el ' +
    fmtDateHuman(
      booking.date
    ) +
    '.' +
    timeMessage +
    ' Te escribimos para coordinar y confirmar el turno.'
  );

}

function renderAdminDayPanel(){

  const panel =
    document.getElementById(
      'admin-day-panel'
    );


  if(!panel){
    return;
  }


  if(!adminSelectedDate){

    panel.innerHTML = `

      <h3>
        Elegí un día
      </h3>

      <p class="note">
        Tocá una fecha en el calendario
        para ver y administrar ese día.
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


  const overrides =
    overridesForDate(iso);


  const habitualRanges =
    habitualRangesForDate(iso);


  const allBookingsDay =
  DB.bookings

    .filter(booking=>
      booking.date === iso
    )

    .sort((a,b)=>{

  const timeA =
    a.time ||
    a.preferredTime ||
    '99:99';

  const timeB =
    b.time ||
    b.preferredTime ||
    '99:99';

  return timeA.localeCompare(
    timeB
  );

});


const closedBookings =
  allBookingsDay.filter(
    booking=>
      booking.status ===
        'rejected' ||
      booking.status ===
        'cancelled'
  );


const bookingsDay =
  showClosedBookings

    ? allBookingsDay

    : allBookingsDay.filter(
        booking=>
          booking.status !==
            'rejected' &&
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
        margin-bottom:18px;
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

      No trabajo este día

    </label>


    ${
      !blocked
        ? `

          <div
            style="
              border-top:
                1px solid var(--line);
              padding-top:16px;
              margin-top:6px;
            "
          >

            <h4>
              Horario del día
            </h4>


            ${
              overrides.length

                ? `

                    <p class="note">
                      Este día tiene un
                      horario especial.
                    </p>

                    <div class="slot-list">

                      ${overrides.map(
                        range=>`

                          <span
                            class="slot-btn"
                            style="
                              display:inline-flex;
                              align-items:center;
                              gap:6px;
                            "
                          >

                            ${range.startTime}
                            -
                            ${range.endTime}

                            <button
                              class="tag-del"
                              onclick="
                                removeDateOverride(
                                  '${range.id}'
                                )
                              "
                            >
                              ✕
                            </button>

                          </span>

                        `
                      ).join('')}

                    </div>


                    <button
                      class="mini-btn"
                      style="margin-top:10px;"
                      onclick="
                        clearDateOverrides(
                          '${iso}'
                        )
                      "
                    >
                      Volver al horario habitual
                    </button>

                  `

                : `

                    <p class="note">
                      Horario habitual:
                    </p>

                    ${
                      habitualRanges.length

                        ? `
                            <div class="slot-list">

                              ${
                                habitualRanges
                                  .map(range=>`

                                    <span
                                      class="slot-btn"
                                    >
                                      ${range.startTime}
                                      -
                                      ${range.endTime}
                                    </span>

                                  `)
                                  .join('')
                              }

                            </div>
                          `

                        : `
                            <div class="empty">
                              No hay horario
                              habitual para este día.
                            </div>
                          `
                    }
                  `
            }


            <h4
              style="
                margin-top:18px;
              "
            >
              ${
                overrides.length
                  ? 'Agregar otro rango especial'
                  : 'Usar horario especial este día'
              }
            </h4>


            ${
              !overrides.length
                ? `
                    <p class="note">
                      Al agregar el primer
                      horario especial,
                      reemplazará al horario
                      habitual solamente
                      para esta fecha.
                    </p>
                  `
                : ''
            }


            <div class="inline-form">

              <div class="f">

                <label>
                  Desde
                </label>

                <input
                  type="time"
                  id="override-start"
                >

              </div>


              <div class="f">

                <label>
                  Hasta
                </label>

                <input
                  type="time"
                  id="override-end"
                >

              </div>


              <button
                class="mini-btn"
                onclick="
                  addDateOverride(
                    '${iso}'
                  )
                "
              >
                Agregar
              </button>

            </div>

          </div>
        `
        : ''
    }


    <div
      style="
        border-top:
          1px solid var(--line);
        padding-top:18px;
        margin-top:20px;
      "
    >

      <h4>
        Agregar clase manualmente
      </h4>

      ${
        DB.students.length &&
        DB.services.length

          ? `

              <div class="field">

                <label>
                  Alumna
                </label>

                <select
                  id="manual-student"
                >

                  <option value="">
                    Elegí una alumna
                  </option>

                  ${
                    DB.students
                      .slice()
                      .sort((a,b)=>
                        a.name.localeCompare(
                          b.name
                        )
                      )
                      .map(student=>`

                        <option
                          value="${student.id}"
                        >
                          ${escapeHTML(
                            student.name
                          )}
                        </option>

                      `)
                      .join('')
                  }

                </select>

              </div>


              <div class="field">

                <label>
                  Clase
                </label>

                <select
                  id="manual-service"
                >

                  <option value="">
                    Elegí una clase
                  </option>

                  ${
                    DB.services
                      .map(service=>`

                        <option
                          value="${service.id}"
                        >
                          ${escapeHTML(
                            service.name
                          )}
                        </option>

                      `)
                      .join('')
                  }

                </select>

              </div>


              <div class="field">

                <label>
                  Horario
                </label>

                <input
                  type="time"
                  id="manual-time"
                >

                <p class="note">
                  Podés poner cualquier
                  horario exacto.
                  Ejemplo: 10:20.
                </p>

              </div>


              <div class="field">

                <label>
                  Nota (opcional)
                </label>

                <input
                  id="manual-note"
                  placeholder="
                    Ej: practicar estacionamiento
                  "
                >

              </div>


              <button
                class="cta-btn small"
                onclick="
                  addManualClass(
                    '${iso}'
                  )
                "
              >
                Agregar clase
              </button>

            `

          : `
              <div class="empty">
                Para agregar una clase
                manual necesitás tener
                al menos una alumna y
                una clase cargadas.
              </div>
            `
      }

    </div>


    <div
      style="
        border-top:
          1px solid var(--line);
        padding-top:18px;
        margin-top:22px;
      "
    >

      <h4>
        Solicitudes y clases
      </h4>

      <div
  style="
    margin-bottom:14px;
  "
>

  <button
    class="mini-btn"
    onclick="
      toggleClosedBookings()
    "
  >
    ${
      showClosedBookings
        ? 'Ocultar rechazadas/canceladas'
        : (
            'Mostrar rechazadas/canceladas' +
            (
              closedBookings.length
                ? ' (' +
                  closedBookings.length +
                  ')'
                : ''
            )
          )
    }
  </button>

</div>

      ${
        bookingsDay.length

          ? `

              <div class="table-scroll">

                <table class="admin-table">

                  <tr>
                    <th>Hora</th>
                    <th>Alumna</th>
                    <th>Clase</th>
                    <th>Estado</th>
                    <th>Asistencia</th>
                    <th></th>
                  </tr>


                  ${bookingsDay.map(
                    booking=>`

                      <tr>

                        <td class="mono">

  ${
    booking.time

      ? booking.time

      : booking.preferredTime

        ? `
            ${booking.preferredTime}

            <br>

            <span class="note">
              Preferido
            </span>
          `

        : '—'
  }

</td>


                        <td>

                          ${
                            escapeHTML(
                              booking.name
                            )
                          }

                          ${
                            bookingCurrentPhone(
                              booking
                            )
                              ? `
                                  <br>

                                  <span class="note">
                                    ${
                                      escapeHTML(
                                        bookingCurrentPhone(
                                          booking
                                        )
                                      )
                                    }
                                  </span>
                                `
                              : ''
                          }

                          ${
                            bookingCurrentAddress(
                              booking
                            )
                              ? `
                                  <br>

                                  <span class="note">
                                    Domicilio:
                                    ${
                                      escapeHTML(
                                        bookingCurrentAddress(
                                          booking
                                        )
                                      )
                                    }
                                  </span>
                                `
                              : ''
                          }

                          ${
                            booking.source ===
                            'manual'
                              ? `
                                  <br>

                                  <span class="note">
                                    Clase agregada
                                    manualmente
                                  </span>
                                `
                              : ''
                          }

                        </td>


                        <td>

                          ${
                            escapeHTML(
                              labelFor(
                                booking.service,
                                booking.serviceName
                              )
                            )
                          }

                          ${
                            booking.adminNote
                              ? `
                                  <br>

                                  <span class="note">
                                    ${
                                      escapeHTML(
                                        booking.adminNote
                                      )
                                    }
                                  </span>
                                `
                              : ''
                          }

                          ${
  booking.preferredTime

    ? `
        <br>

        <span class="note">
          Horario solicitado:
          ${booking.preferredTime}
        </span>
      `

    : ''
}

                        </td>


                        <td>

                          <span
  class="
    pill
    ${
      bookingStatusClass(
        booking.status
      )
    }
  "
>
  ${
    bookingStatusLabel(
      booking.status
    )
  }
</span>

                        </td>


                        <td>

                          ${
                            booking.attendanceStatus ===
                            'completed'
                              ? `
                                  <span
                                    class="
                                      pill
                                      confirmed
                                    "
                                  >
                                    Realizada
                                  </span>
                                `

                              : booking.attendanceStatus ===
                                'not_completed'
                                ? `
                                    <span
                                      class="
                                        pill
                                        cancelled
                                      "
                                    >
                                      No realizada
                                    </span>
                                  `

                                : `
                                    <span class="note">
                                      Pendiente
                                    </span>
                                  `
                          }

                        </td>


                        <td class="btnrow">


                          ${
                            booking.status ===
                            'pending'
                              ? `

                                  <button
                                    class="mini-btn"
                                    onclick="
                                      changeBookingTime(
                                        '${booking.id}'
                                      )
                                    "
                                  >
                                    Cambiar horario
                                  </button>


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


                                  <button
                                    class="mini-btn no"
                                    onclick="
                                      setBookingStatus(
                                        '${booking.id}',
                                        'rejected'
                                      )
                                    "
                                  >
                                    Rechazar
                                  </button>

                                `
                              : ''
                          }


                          ${
                            booking.status ===
                            'confirmed'
                              ? `

                                  <button
                                    class="mini-btn"
                                    onclick="
                                      changeBookingTime(
                                        '${booking.id}'
                                      )
                                    "
                                  >
                                    Cambiar horario
                                  </button>


                                  <button
                                    class="mini-btn ok"
                                    onclick="
                                      setBookingAttendance(
                                        '${booking.id}',
                                        'completed'
                                      )
                                    "
                                  >
                                    Realizada
                                  </button>


                                  <button
                                    class="mini-btn"
                                    onclick="
                                      setBookingAttendance(
                                        '${booking.id}',
                                        'not_completed'
                                      )
                                    "
                                  >
                                    No realizada
                                  </button>


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


                          ${
                            bookingCurrentPhone(
                              booking
                            ) &&
bookingOccupiesSlot(
  booking
)

                              ? `

                                  <a
                                    class="mini-btn wa"
                                    target="_blank"
                                    rel="
                                      noopener noreferrer
                                    "
                                    href="${
                                      waLink(
  bookingCurrentPhone(
    booking
  ),
  bookingWhatsAppText(
    booking
  )
)
                                    }"
                                  >
                                    WhatsApp
                                  </a>

                                `
                              : ''
                          }

                        </td>

                      </tr>

                    `
                  ).join('')}

                </table>

              </div>

            `

          : `
              <div class="empty">
                No hay solicitudes ni
                clases para este día.
              </div>
            `
      }

    </div>
  `;
}

/* ==================================================================
   ADMINISTRADOR: ALUMNAS
   ================================================================== */


function observationsForStudent(
  studentId
){

  return (
    DB.studentObservations || []
  )
    .filter(item=>
      item.studentId === studentId
    )
    .sort((a,b)=>{

      const dateA =
        a.date || '';

      const dateB =
        b.date || '';

      if(dateA !== dateB){
        return dateB.localeCompare(
          dateA
        );
      }

      return String(
        b.createdAt || ''
      ).localeCompare(
        String(
          a.createdAt || ''
        )
      );
    });
}

let studentSearchTerm = '';
let editingStudentId = null;

function normalizeStudentSearch(
  value
){

  return String(
    value || ''
  )
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .toLowerCase()
    .trim();

}

function filterStudentCards(
  value
){

  studentSearchTerm =
    value || '';

  const term =
    normalizeStudentSearch(
      studentSearchTerm
    );

  let visibleCount =
    0;

  DB.students.forEach(
    student=>{

      const card =
        document.getElementById(
          'student-card-' +
          student.id
        );

      if(!card){
        return;
      }

      const searchableText =
        normalizeStudentSearch(
          [
            student.name,
            student.phone,
            student.address
          ].join(' ')
        );

      const matches =
        !term ||
        searchableText.includes(
          term
        );

      card.style.display =
        matches
          ? ''
          : 'none';

      if(matches){
        visibleCount++;
      }

    }
  );

  const emptyMessage =
    document.getElementById(
      'student-search-empty'
    );

  if(emptyMessage){

    emptyMessage.style.display =
      term &&
      visibleCount === 0
        ? 'block'
        : 'none';

  }

}

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
        Datos de contacto,
        dirección, licencia,
        clases tomadas,
        progreso y observaciones
        de cada alumna.
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

            <input
              id="st-name"
            >

          </div>


          <div class="f">

            <label>
              Teléfono
            </label>

            <input
              id="st-phone"
            >

          </div>


          <div class="f">

            <label>
              Dirección
            </label>

            <input
              id="st-address"
              placeholder="Ej: San Martín 1250"
            >

          </div>


          <div class="f">

            <label
              style="
                display:block;
                margin-bottom:8px;
              "
            >
              Licencia de conducir
            </label>

            <label
              style="
                display:flex;
                align-items:center;
                justify-content:flex-start;
                gap:10px;
                width:max-content;
                max-width:100%;
                margin:0;
                cursor:pointer;
              "
            >

              <input
                id="st-has-license"
                type="checkbox"
                style="
                  width:18px !important;
                  min-width:18px !important;
                  max-width:18px !important;
                  height:18px;
                  margin:0;
                  padding:0;
                  flex:0 0 18px;
                "
              >

              <span
                style="
                  display:inline-block;
                  width:auto;
                  white-space:nowrap;
                  line-height:1.3;
                "
              >
                Tiene licencia
              </span>

            </label>

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
              placeholder="
                Ej: recién empieza
              "
            >

          </div>


          <button
            type="button"
            class="mini-btn"
            onclick="addStudent(this)"
          >
            Agregar
          </button>

        </div>

      </div>


      ${
        DB.students.length
          ? `
              <div
                class="panel"
                style="
                  margin-bottom:18px;
                "
              >

                <h3>
                  Buscar alumna
                </h3>

                <div class="field">

                  <input
                    id="student-search"
                    type="search"
                    placeholder="
                      Buscar por nombre,
                      teléfono o dirección...
                    "
                    value="${
                      escapeHTML(
                        studentSearchTerm
                      )
                    }"
                    oninput="
                      filterStudentCards(
                        this.value
                      )
                    "
                  >

                </div>

              </div>


              <div
                id="student-search-empty"
                class="empty"
                style="
                  display:none;
                  margin-bottom:18px;
                "
              >
                No se encontró ninguna alumna.
              </div>
            `
          : ''
      }


      ${
        DB.students.length

          ? DB.students
              .slice()
              .sort((a,b)=>
                a.name.localeCompare(
                  b.name
                )
              )
              .map(student=>{

                const observations =
                  observationsForStudent(
                    student.id
                  );

                return `

                  <div
                    id="student-card-${student.id}"
                    class="panel student-card"
                    style="
                      margin-bottom:18px;
                    "
                  >


                    ${
                      editingStudentId ===
                        student.id

                        ? `

                            <div
                              style="
                                border:
                                  1px solid
                                  var(--line);
                                border-radius:
                                  12px;
                                padding:16px;
                                background:
                                  var(--cream-dim);
                              "
                            >

                              <h4
                                style="
                                  margin-bottom:14px;
                                "
                              >
                                Editar datos de la alumna
                              </h4>


                              <div class="inline-form">

                                <div class="f">

                                  <label>
                                    Nombre
                                  </label>

                                  <input
                                    id="edit-st-name-${student.id}"
                                    value="${
                                      escapeHTML(
                                        student.name
                                      )
                                    }"
                                  >

                                </div>


                                <div class="f">

                                  <label>
                                    Teléfono
                                  </label>

                                  <input
                                    id="edit-st-phone-${student.id}"
                                    value="${
                                      escapeHTML(
                                        student.phone
                                      )
                                    }"
                                  >

                                </div>


                                <div class="f">

                                  <label>
                                    Dirección
                                  </label>

                                  <input
                                    id="edit-st-address-${student.id}"
                                    value="${
                                      escapeHTML(
                                        student.address
                                      )
                                    }"
                                  >

                                </div>


                                <div class="f">

                                  <label>
                                    Clases tomadas
                                  </label>

                                  <input
                                    id="edit-st-classes-${student.id}"
                                    type="number"
                                    min="0"
                                    value="${
                                      student.classesTaken
                                    }"
                                    style="width:100px;"
                                  >

                                </div>


                                <div class="f">

                                  <label>
                                    Progreso
                                  </label>

                                  <input
                                    id="edit-st-progress-${student.id}"
                                    value="${
                                      escapeHTML(
                                        student.progress
                                      )
                                    }"
                                  >

                                </div>


                                <div class="f">

                                  <label
                                    style="
                                      display:block;
                                      margin-bottom:8px;
                                    "
                                  >
                                    Licencia de conducir
                                  </label>

                                  <label
                                    style="
                                      display:flex;
                                      align-items:center;
                                      justify-content:flex-start;
                                      gap:10px;
                                      width:max-content;
                                      max-width:100%;
                                      margin:0;
                                      cursor:pointer;
                                    "
                                  >

                                    <input
                                      id="edit-st-license-${student.id}"
                                      type="checkbox"
                                      style="
                                        width:18px !important;
                                        min-width:18px !important;
                                        max-width:18px !important;
                                        height:18px;
                                        margin:0;
                                        padding:0;
                                        flex:0 0 18px;
                                      "
                                      ${
                                        student.hasLicense
                                          ? 'checked'
                                          : ''
                                      }
                                    >

                                    <span
                                      style="
                                        display:inline-block;
                                        width:auto;
                                        white-space:nowrap;
                                        line-height:1.3;
                                      "
                                    >
                                      Tiene licencia
                                    </span>

                                  </label>

                                </div>

                              </div>


                              <div
                                style="
                                  display:flex;
                                  gap:8px;
                                  flex-wrap:wrap;
                                  margin-top:14px;
                                "
                              >

                                <button
                                  type="button"
                                  class="mini-btn ok"
                                  onclick="
                                    saveStudentEdits(
                                      '${student.id}',
                                      this
                                    )
                                  "
                                >
                                  Guardar cambios
                                </button>


                                <button
                                  type="button"
                                  class="mini-btn"
                                  onclick="cancelStudentEdit()"
                                >
                                  Cancelar
                                </button>

                              </div>

                            </div>

                          `

                        : `

                            <div
                              style="
                                display:flex;
                                justify-content:
                                  space-between;
                                gap:16px;
                                flex-wrap:wrap;
                                align-items:flex-start;
                              "
                            >


                              <div
                                style="
                                  flex:1;
                                  min-width:240px;
                                "
                              >

                                <h3
                                  style="
                                    margin-bottom:5px;
                                  "
                                >
                                  ${
                                    escapeHTML(
                                      student.name
                                    )
                                  }
                                </h3>


                                ${
                                  student.phone

                                    ? `
                                        <p
                                          class="note"
                                          style="
                                            margin:
                                              0 0 5px;
                                          "
                                        >
                                          Teléfono:
                                          ${
                                            escapeHTML(
                                              student.phone
                                            )
                                          }
                                        </p>
                                      `

                                    : ''
                                }


                                ${
                                  student.address

                                    ? `
                                        <p
                                          class="note"
                                          style="
                                            margin:
                                              0 0 5px;
                                          "
                                        >
                                          Dirección:
                                          ${
                                            escapeHTML(
                                              student.address
                                            )
                                          }
                                        </p>
                                      `

                                    : ''
                                }


                                <label
                                  class="note"
                                  style="
                                    display:flex;
                                    align-items:center;
                                    justify-content:flex-start;
                                    gap:10px;
                                    width:max-content;
                                    max-width:100%;
                                    margin:
                                      0 0 5px;
                                    cursor:pointer;
                                  "
                                >

                                  <input
                                    type="checkbox"
                                    style="
                                      width:18px !important;
                                      min-width:18px !important;
                                      max-width:18px !important;
                                      height:18px;
                                      margin:0;
                                      padding:0;
                                      flex:0 0 18px;
                                    "
                                    ${
                                      student.hasLicense
                                        ? 'checked'
                                        : ''
                                    }
                                    onchange="
                                      updateStudentLicense(
                                        '${student.id}',
                                        this.checked,
                                        this
                                      )
                                    "
                                  >

                                  <span
                                    style="
                                      display:inline-block;
                                      width:auto;
                                      line-height:1.3;
                                    "
                                  >
                                    Tiene licencia de conducir
                                  </span>

                                </label>


                                ${
                                  student.progress

                                    ? `
                                        <p
                                          class="note"
                                          style="
                                            margin:0;
                                          "
                                        >
                                          Progreso:
                                          ${
                                            escapeHTML(
                                              student.progress
                                            )
                                          }
                                        </p>
                                      `

                                    : ''
                                }

                              </div>


                              <div
                                style="
                                  display:flex;
                                  gap:8px;
                                  flex-wrap:wrap;
                                "
                              >

                                <button
                                  type="button"
                                  class="mini-btn"
                                  onclick="
                                    beginStudentEdit(
                                      '${student.id}'
                                    )
                                  "
                                >
                                  Editar datos
                                </button>


                                <button
                                  type="button"
                                  class="mini-btn no"
                                  onclick="
                                    removeStudent(
                                      '${student.id}'
                                    )
                                  "
                                >
                                  Eliminar ficha
                                </button>

                              </div>

                            </div>

                          `
                    }



                    <div
                      style="
                        border-top:
                          1px solid
                          var(--line);
                        margin-top:16px;
                        padding-top:16px;
                      "
                    >

                      <h4>
                        Clases tomadas
                      </h4>


                      <div
                        style="
                          display:flex;
                          align-items:center;
                          gap:12px;
                          flex-wrap:wrap;
                        "
                      >


                        <button
                          type="button"
                          class="mini-btn no"
                          onclick="
                            changeClasses(
                              '${student.id}',
                              -1
                            )
                          "
                          ${
                            student.classesTaken <= 0
                              ? 'disabled'
                              : ''
                          }
                        >
                          −1
                        </button>


                        <strong
                          class="mono"
                          style="
                            font-size:22px;
                            min-width:32px;
                            text-align:center;
                          "
                        >
                          ${
                            student.classesTaken
                          }
                        </strong>


                        <button
                          type="button"
                          class="mini-btn ok"
                          onclick="
                            changeClasses(
                              '${student.id}',
                              1
                            )
                          "
                        >
                          +1
                        </button>

                      </div>


                      <p
                        class="note"
                        style="
                          margin-top:8px;
                          margin-bottom:0;
                        "
                      >
                        Las clases marcadas
                        como realizadas en la
                        Agenda se suman
                        automáticamente.
                        Estos botones sirven
                        para hacer una
                        corrección manual.
                      </p>

                    </div>



                    <div
                      style="
                        border-top:
                          1px solid
                          var(--line);
                        margin-top:18px;
                        padding-top:18px;
                      "
                    >

                      <h4>
                        Observaciones
                      </h4>


                      <div class="field">

                        <label>
                          Nueva observación
                        </label>

                        <textarea
                          id="student-observation-${student.id}"
                          rows="3"
                          placeholder="
                            Ej: hoy practicó estacionamiento
                            y necesita reforzar el uso de espejos.
                          "
                        ></textarea>

                      </div>


                      <button
                        type="button"
                        class="mini-btn"
                        onclick="
                          addStudentObservation(
                            '${student.id}',
                            this
                          )
                        "
                      >
                        Agregar observación
                      </button>


                      <div
                        style="
                          margin-top:18px;
                        "
                      >

                        ${
                          observations.length

                            ? observations
                                .map(item=>`

                                  <div
                                    style="
                                      border:
                                        1px solid
                                        var(--line);
                                      border-radius:
                                        12px;
                                      padding:
                                        12px 14px;
                                      margin-bottom:
                                        10px;
                                      background:
                                        var(--cream-dim);
                                    "
                                  >

                                    <div
                                      style="
                                        display:flex;
                                        justify-content:
                                          space-between;
                                        align-items:
                                          flex-start;
                                        gap:12px;
                                        flex-wrap:wrap;
                                      "
                                    >

                                      <div
                                        style="
                                          flex:1;
                                          min-width:220px;
                                        "
                                      >

                                        <div
                                          class="note"
                                          style="
                                            margin-bottom:
                                              6px;
                                          "
                                        >
                                          ${
                                            item.date
                                              ? fmtDateHuman(
                                                  item.date
                                                )
                                              : ''
                                          }
                                        </div>


                                        <div>
                                          ${
                                            escapeHTML(
                                              item.observation
                                            )
                                          }
                                        </div>

                                      </div>


                                      <div
                                        style="
                                          display:flex;
                                          gap:6px;
                                          flex-wrap:wrap;
                                        "
                                      >

                                        <button
                                          type="button"
                                          class="mini-btn"
                                          onclick="
                                            editStudentObservation(
                                              '${item.id}',
                                              this
                                            )
                                          "
                                        >
                                          Editar
                                        </button>


                                        <button
                                          type="button"
                                          class="mini-btn no"
                                          onclick="
                                            deleteStudentObservation(
                                              '${item.id}',
                                              this
                                            )
                                          "
                                        >
                                          Eliminar
                                        </button>

                                      </div>

                                    </div>

                                  </div>

                                `)
                                .join('')

                            : `
                                <div class="empty">
                                  Todavía no hay
                                  observaciones para
                                  esta alumna.
                                </div>
                              `
                        }

                      </div>

                    </div>

                  </div>
                `;
              })
              .join('')

          : `
              <div class="empty">
                Todavía no cargaste alumnas.
              </div>
            `
      }
    `;

  if(studentSearchTerm){
    filterStudentCards(
      studentSearchTerm
    );
  }

}

function beginStudentEdit(
  studentId
){

  const student =
    DB.students.find(
      item=>
        item.id === studentId
    );

  if(!student){
    return;
  }

  editingStudentId =
    studentId;

  renderAdminStudents();

  const nameInput =
    document.getElementById(
      'edit-st-name-' +
      studentId
    );

  if(nameInput){
    nameInput.focus();
    nameInput.select();
  }

}


function cancelStudentEdit(){

  editingStudentId = null;

  renderAdminStudents();

}


async function saveStudentEdits(
  studentId,
  button
){

  if(
    button &&
    button.disabled
  ){
    return;
  }


  const student =
    DB.students.find(
      item=>
        item.id === studentId
    );

  if(!student){
    return;
  }


  const nameInput =
    document.getElementById(
      'edit-st-name-' +
      studentId
    );

  const phoneInput =
    document.getElementById(
      'edit-st-phone-' +
      studentId
    );

  const addressInput =
    document.getElementById(
      'edit-st-address-' +
      studentId
    );

  const classesInput =
    document.getElementById(
      'edit-st-classes-' +
      studentId
    );

  const progressInput =
    document.getElementById(
      'edit-st-progress-' +
      studentId
    );

  const licenseInput =
    document.getElementById(
      'edit-st-license-' +
      studentId
    );


  if(
    !nameInput ||
    !phoneInput ||
    !addressInput ||
    !classesInput ||
    !progressInput ||
    !licenseInput
  ){
    return;
  }


  const name =
    nameInput.value.trim();

  if(!name){

    alert(
      'El nombre de la alumna no puede quedar vacío.'
    );

    nameInput.focus();

    return;
  }


  const phone =
    phoneInput.value.trim();

  const address =
    addressInput.value.trim();

  const progress =
    progressInput.value.trim();

  const hasLicense =
    licenseInput.checked;

  const classesTaken =
    Math.max(
      0,
      Number(
        classesInput.value
      ) || 0
    );


  if(button){

    button.disabled =
      true;

    button.textContent =
      'Guardando...';

  }


  try{

    const { error } =
      await supabaseClient

        .from('students')

        .update({

          name,

          phone,

          address,

          has_license:
            hasLicense,

          classes_taken:
            classesTaken,

          progress,

          updated_at:
            new Date()
              .toISOString()

        })

        .eq(
          'id',
          studentId
        );


    if(error){
      throw error;
    }


    /*
      Las reservas guardan una copia del
      nombre y del teléfono de la alumna.
      Si alguno cambia en la ficha,
      mantenemos también las reservas
      anteriores sincronizadas.
    */
    const bookingDataChanged =
      name !== student.name ||
      phone !== student.phone;


    if(bookingDataChanged){

      const { error: bookingsError } =
        await supabaseClient

          .from('bookings')

          .update({

            student_name:
              name,

            phone:
              phone

          })

          .eq(
            'student_id',
            studentId
          );


      if(bookingsError){
        throw bookingsError;
      }

    }


    /*
      Pagos y deudas guardan una copia
      del nombre, por eso también la
      actualizamos cuando se corrige.
    */
    if(name !== student.name){

      const [
        paymentsResult,
        duesResult
      ] = await Promise.all([

        supabaseClient
          .from('payments')
          .update({
            student_name:
              name
          })
          .eq(
            'student_id',
            studentId
          ),

        supabaseClient
          .from('payment_dues')
          .update({
            student_name:
              name
          })
          .eq(
            'student_id',
            studentId
          )

      ]);


      const relatedError =
        paymentsResult.error ||
        duesResult.error;


      if(relatedError){
        throw relatedError;
      }

    }


    editingStudentId = null;

    await loadAdminData();

    renderAdminStudents();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudieron guardar los cambios de la alumna.'
    );


    if(button){

      button.disabled =
        false;

      button.textContent =
        'Guardar cambios';

    }

  }

}


async function addStudent(
  button
){

  if(
    button &&
    button.disabled
  ){
    return;
  }


  const nameInput =
    document.getElementById(
      'st-name'
    );

  const phoneInput =
    document.getElementById(
      'st-phone'
    );

  const addressInput =
    document.getElementById(
      'st-address'
    );

  const licenseInput =
    document.getElementById(
      'st-has-license'
    );

  const classesInput =
    document.getElementById(
      'st-classes'
    );

  const progressInput =
    document.getElementById(
      'st-progress'
    );


  const name =
    nameInput.value.trim();


  if(!name){

    alert(
      'Escribí el nombre de la alumna.'
    );

    return;
  }


  const classesTaken =
    Math.max(
      0,
      Number(
        classesInput.value
      ) || 0
    );


  if(button){

    button.disabled =
      true;

    button.textContent =
      'Guardando...';
  }


  try{

    const { error } =
      await supabaseClient

        .from('students')

        .insert({

          name,

          phone:
            phoneInput.value.trim(),

          address:
            addressInput.value.trim(),

          has_license:
            Boolean(
              licenseInput.checked
            ),

          classes_taken:
            classesTaken,

          progress:
            progressInput.value.trim()

        });


    if(error){
      throw error;
    }


    studentSearchTerm =
      '';

    await loadAdminData();

    renderAdminStudents();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo agregar la alumna.'
    );


    if(button){

      button.disabled =
        false;

      button.textContent =
        'Agregar';
    }

  }

}

async function changeClasses(
  id,
  amount
){

  const student =
    DB.students.find(
      item=>item.id === id
    );


  if(!student){
    return;
  }


  const newTotal =
    Math.max(
      0,
      student.classesTaken +
      amount
    );


  if(
    newTotal ===
      student.classesTaken
  ){
    return;
  }


  try{

    const { error } =
      await supabaseClient

        .from('students')

        .update({

          classes_taken:
            newTotal,

          updated_at:
            new Date()
              .toISOString()

        })

        .eq(
          'id',
          id
        );


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

async function updateStudentLicense(
  studentId,
  hasLicense,
  checkbox
){

  if(
    checkbox &&
    checkbox.disabled
  ){
    return;
  }


  if(checkbox){
    checkbox.disabled =
      true;
  }


  try{

    const { error } =
      await supabaseClient

        .from('students')

        .update({

          has_license:
            hasLicense,

          updated_at:
            new Date()
              .toISOString()

        })

        .eq(
          'id',
          studentId
        );


    if(error){
      throw error;
    }


    await loadAdminData();

    renderAdminStudents();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo actualizar el estado de la licencia.'
    );


    if(checkbox){

      checkbox.checked =
        !hasLicense;

      checkbox.disabled =
        false;
    }

  }

}

async function addStudentObservation(
  studentId,
  button
){

  if(
    button &&
    button.disabled
  ){
    return;
  }


  const textarea =
    document.getElementById(
      'student-observation-' +
      studentId
    );


  if(!textarea){
    return;
  }


  const observation =
    textarea.value.trim();


  if(!observation){

    alert(
      'Escribí una observación.'
    );

    return;
  }


  if(button){

    button.disabled =
      true;

    button.textContent =
      'Guardando...';
  }


  try{

    const { error } =
      await supabaseClient

        .from(
          'student_observations'
        )

        .insert({

          student_id:
            studentId,

          observation,

          observation_date:
            todayISO()

        });


    if(error){
      throw error;
    }


    await loadAdminData();

    renderAdminStudents();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo guardar la observación.'
    );


    if(button){

      button.disabled =
        false;

      button.textContent =
        'Agregar observación';
    }

  }

}

async function editStudentObservation(
  observationId,
  button
){

  const item =
    DB.studentObservations.find(
      observation=>
        observation.id ===
          observationId
    );


  if(!item){
    return;
  }


  const newText =
    await openEditModal({
      title:
        'Editar observación',
      label:
        'Observación',
      value:
        item.observation,
      textarea:
        true,
      confirmText:
        'Guardar cambios'
    });


  if(newText === null){
    return;
  }


  const cleanText =
    newText.trim();


  if(!cleanText){

    alert(
      'La observación no puede quedar vacía.'
    );

    return;
  }


  if(
    cleanText ===
      item.observation
  ){
    return;
  }


  if(button){

    button.disabled =
      true;

    button.textContent =
      'Guardando...';
  }


  try{

    const { error } =
      await supabaseClient

        .from(
          'student_observations'
        )

        .update({

          observation:
            cleanText

        })

        .eq(
          'id',
          observationId
        );


    if(error){
      throw error;
    }


    await loadAdminData();

    renderAdminStudents();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo editar la observación.'
    );


    if(button){

      button.disabled =
        false;

      button.textContent =
        'Editar';
    }

  }

}

async function deleteStudentObservation(
  observationId,
  button
){

  const item =
    DB.studentObservations.find(
      observation=>
        observation.id ===
          observationId
    );


  if(!item){
    return;
  }


  if(
    !(
      await openAppConfirm(
        '¿Querés eliminar esta observación?',
        {
          title:'Eliminar observación',
          confirmText:'Eliminar'
        }
      )
    )
  ){
    return;
  }


  if(button){

    button.disabled =
      true;

    button.textContent =
      'Eliminando...';
  }


  try{

    const { error } =
      await supabaseClient

        .from(
          'student_observations'
        )

        .delete()

        .eq(
          'id',
          observationId
        );


    if(error){
      throw error;
    }


    await loadAdminData();

    renderAdminStudents();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo eliminar la observación.'
    );


    if(button){

      button.disabled =
        false;

      button.textContent =
        'Eliminar';
    }

  }

}

async function removeStudent(id){

  const student =
    DB.students.find(
      item=>item.id === id
    );


  if(!student){
    return;
  }


  if(
    !(
      await openAppConfirm(
        '¿Querés eliminar la ficha de ' +
        student.name +
        '?',
        {
          title:'Eliminar ficha',
          confirmText:'Eliminar'
        }
      )
    )
  ){
    return;
  }


  try{

    const { error } =
      await supabaseClient

        .from('students')

        .delete()

        .eq(
          'id',
          id
        );


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
   ADMINISTRADOR: PAGOS
   ================================================================== */

function paymentMethodLabel(method){

  if(method === 'cash'){
    return 'Efectivo';
  }

  if(method === 'transfer'){
    return 'Transferencia';
  }

  return method || '-';
}

let paymentFilters = {
  studentId: '',
  from: '',
  to: ''
};


function paymentPassesFilters(item){

  if(
    paymentFilters.studentId &&
    item.studentId !==
      paymentFilters.studentId
  ){
    return false;
  }


  if(
    paymentFilters.from &&
    item.date <
      paymentFilters.from
  ){
    return false;
  }


  if(
    paymentFilters.to &&
    item.date >
      paymentFilters.to
  ){
    return false;
  }


  return true;
}


function applyPaymentFilters(){

  paymentFilters.studentId =
    document
      .getElementById(
        'payment-filter-student'
      )
      ?.value || '';


  paymentFilters.from =
    document
      .getElementById(
        'payment-filter-from'
      )
      ?.value || '';


  paymentFilters.to =
    document
      .getElementById(
        'payment-filter-to'
      )
      ?.value || '';


  renderAdminPayments();
}


function clearPaymentFilters(){

  paymentFilters = {
    studentId: '',
    from: '',
    to: ''
  };


  renderAdminPayments();
}

function renderAdminPayments(){

  const allPendingDues =
  (DB.paymentDues || [])
    .filter(item=>
      item.status === 'pending'
    );


const pendingDues =
  allPendingDues
    .filter(
      paymentPassesFilters
    );


const filteredPayments =
  (DB.payments || [])
    .filter(
      paymentPassesFilters
    );


const pendingTotal =
  allPendingDues.reduce(
    (total,item)=>
      total + item.amount,
    0
  );


  document
    .getElementById(
      'admin-main'
    )
    .innerHTML = `

      <h2>
        Pagos
      </h2>

      <p
        class="lede"
        style="margin-bottom:22px;"
      >
        Registrá los pagos reales
        recibidos y los saldos que
        todavía quedan pendientes.
      </p>


      <div class="stat-grid">

        <div class="stat-card">

          <div class="num">
            ${
              fmtMoney(
                (DB.payments || [])
                  .reduce(
                    (total,item)=>
                      total + item.amount,
                    0
                  )
              )
            }
          </div>

          <div class="lbl">
            Total registrado
          </div>

        </div>


        <div class="stat-card">

          <div class="num">
            ${fmtMoney(pendingTotal)}
          </div>

          <div class="lbl">
            Pendiente de cobro
          </div>

        </div>

      </div>

      <div class="panel">

  <h3>
    Filtrar movimientos
  </h3>


  <div class="inline-form">

    <div class="f">

      <label>
        Alumna
      </label>

      <select
        id="payment-filter-student"
      >

        <option value="">
          Todas las alumnas
        </option>

        ${
          DB.students
            .slice()
            .sort((a,b)=>
              a.name.localeCompare(
                b.name
              )
            )
            .map(student=>`

              <option
                value="${student.id}"
                ${
                  paymentFilters.studentId ===
                    student.id
                    ? 'selected'
                    : ''
                }
              >
                ${
                  escapeHTML(
                    student.name
                  )
                }
              </option>

            `)
            .join('')
        }

      </select>

    </div>


    <div class="f">

      <label>
        Desde
      </label>

      <input
        id="payment-filter-from"
        type="date"
        value="${paymentFilters.from}"
      >

    </div>


    <div class="f">

      <label>
        Hasta
      </label>

      <input
        id="payment-filter-to"
        type="date"
        value="${paymentFilters.to}"
      >

    </div>


    <button
      class="mini-btn"
      onclick="applyPaymentFilters()"
    >
      Aplicar filtros
    </button>


    <button
      class="mini-btn"
      onclick="clearPaymentFilters()"
    >
      Limpiar
    </button>

  </div>

</div>

      <div class="panel">

        <h3>
          Registrar pago
        </h3>


        ${
          DB.students.length

            ? `

                <div class="inline-form">


                  <div class="f">

                    <label>
                      Alumna
                    </label>

                    <select
                      id="payment-student"
                    >

                      <option value="">
                        Elegí una alumna
                      </option>

                      ${
                        DB.students
                          .slice()
                          .sort((a,b)=>
                            a.name.localeCompare(
                              b.name
                            )
                          )
                          .map(student=>`

                            <option
                              value="${student.id}"
                            >
                              ${
                                escapeHTML(
                                  student.name
                                )
                              }
                            </option>

                          `)
                          .join('')
                      }

                    </select>

                  </div>


                  <div class="f">

                    <label>
                      Monto
                    </label>

                    <input
  id="payment-amount"
  type="text"
  inputmode="decimal"
  placeholder="Ej: 15.000"
  oninput="formatMoneyField(this)"
>

                  </div>


                  <div class="f">

                    <label>
                      Medio de pago
                    </label>

                    <select
                      id="payment-method"
                    >

                      <option value="cash">
                        Efectivo
                      </option>

                      <option value="transfer">
                        Transferencia
                      </option>

                    </select>

                  </div>


                  <div class="f">

                    <label>
                      Fecha
                    </label>

                    <input
                      id="payment-date"
                      type="date"
                      value="${todayISO()}"
                    >

                  </div>

                </div>


                <div class="field">

                  <label>
                    Descripción (opcional)
                  </label>

                  <input
                    id="payment-description"
                    placeholder="Ej: pago de 3 clases"
                  >

                </div>


                <button
                  class="cta-btn small"
                  onclick="addPayment()"
                >
                  Registrar pago
                </button>

              `

            : `
                <div class="empty">
                  Primero necesitás cargar
                  una alumna.
                </div>
              `
        }

      </div>



      <div class="panel">

        <h3>
          Registrar saldo pendiente
        </h3>


        ${
          DB.students.length

            ? `

                <div class="inline-form">


                  <div class="f">

                    <label>
                      Alumna
                    </label>

                    <select
                      id="due-student"
                    >

                      <option value="">
                        Elegí una alumna
                      </option>

                      ${
                        DB.students
                          .slice()
                          .sort((a,b)=>
                            a.name.localeCompare(
                              b.name
                            )
                          )
                          .map(student=>`

                            <option
                              value="${student.id}"
                            >
                              ${
                                escapeHTML(
                                  student.name
                                )
                              }
                            </option>

                          `)
                          .join('')
                      }

                    </select>

                  </div>


                  <div class="f">

                    <label>
                      Monto pendiente
                    </label>

                    <input
  id="due-amount"
  type="text"
  inputmode="decimal"
  placeholder="Ej: 10.000"
  oninput="formatMoneyField(this)"
>

                  </div>


                  <div class="f">

                    <label>
                      Fecha
                    </label>

                    <input
                      id="due-date"
                      type="date"
                      value="${todayISO()}"
                    >

                  </div>

                </div>


                <div class="field">

                  <label>
                    Descripción
                  </label>

                  <input
                    id="due-description"
                    placeholder="Ej: resta abonar una clase"
                  >

                </div>


                <button
                  class="cta-btn small"
                  onclick="addPaymentDue()"
                >
                  Registrar pendiente
                </button>

              `

            : ''
        }

      </div>



      <div class="panel">

        <h3>
          Saldos pendientes
        </h3>


        ${
          pendingDues.length

            ? `

                <div class="table-scroll">

                  <table class="admin-table">

                    <tr>
                      <th>Fecha</th>
                      <th>Alumna</th>
                      <th>Descripción</th>
                      <th>Monto</th>
                      <th>Medio de pago</th>
                      <th></th>
                    </tr>


                    ${pendingDues.map(item=>`

                      <tr>

                        <td>
                          ${
                            item.date
                              ? fmtDateHuman(
                                  item.date
                                )
                              : '-'
                          }
                        </td>


                        <td>
                          ${
                            escapeHTML(
                              item.studentName
                            )
                          }
                        </td>


                        <td>
                          ${
                            escapeHTML(
                              item.description
                            )
                          }
                        </td>


                        <td class="mono">
                          ${fmtMoney(item.amount)}
                        </td>


                        <td>

                          <select
                            id="due-method-${item.id}"
                            style="min-width:140px;"
                          >
                            <option value="">
                              Elegí el medio
                            </option>

                            <option value="cash">
                              Efectivo
                            </option>

                            <option value="transfer">
                              Transferencia
                            </option>
                          </select>

                        </td>


                        <td class="btnrow">

                          <button
                            class="mini-btn ok"
                            onclick="
                              resolvePaymentDue(
                                '${item.id}',
                                this
                              )
                            "
                          >
                            Marcar como resuelto
                          </button>

                        </td>

                      </tr>

                    `).join('')}

                  </table>

                </div>

              `

            : `
                <div class="empty">
                  No hay saldos pendientes.
                </div>
              `
        }

      </div>



      <div class="panel">

        <h3>
          Historial de pagos
        </h3>


        ${
          filteredPayments.length

            ? `

                <div class="table-scroll">

                  <table class="admin-table">

                    <tr>
                      <th>Fecha</th>
                      <th>Alumna</th>
                      <th>Medio</th>
                      <th>Descripción</th>
                      <th>Monto</th>
                      <th>Acciones</th>
                    </tr>


                    ${
                      filteredPayments
                        .map(payment=>`

                          <tr>

                            <td>
                              ${
                                payment.date
                                  ? fmtDateHuman(
                                      payment.date
                                    )
                                  : '-'
                              }
                            </td>


                            <td>
                              ${
                                escapeHTML(
                                  payment.studentName
                                )
                              }
                            </td>


                            <td>
                              ${
                                paymentMethodLabel(
                                  payment.method
                                )
                              }
                            </td>


                            <td>
                              ${
                                escapeHTML(
                                  payment.description
                                )
                              }
                            </td>


                            <td class="mono">
                              ${
                                fmtMoney(
                                  payment.amount
                                )
                              }
                            </td>


                            <td class="btnrow">

                              <button
                                class="mini-btn"
                                onclick="
                                  editPayment(
                                    '${payment.id}',
                                    this
                                  )
                                "
                              >
                                Modificar
                              </button>

                              <button
                                class="mini-btn no"
                                onclick="
                                  deletePayment(
                                    '${payment.id}',
                                    this
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

              `

            : `
                <div class="empty">
                  Todavía no hay pagos registrados.
                </div>
              `
        }

      </div>
    `;
}



async function editPayment(
  paymentId,
  button
){

  if(
    button &&
    button.disabled
  ){
    return;
  }


  const payment =
    DB.payments.find(
      item=>item.id === paymentId
    );


  if(!payment){
    return;
  }


  const enteredAmount =
    await openEditModal({
      title:
        'Modificar pago',
      label:
        'Monto correcto del pago',
      value:
        formatMoneyInputValue(
          payment.amount
        ),
      inputType:
        'text',
      formatMoney:
        true,
      confirmText:
        'Guardar monto'
    });


  if(enteredAmount === null){
    return;
  }


  const amount =
    parseMoneyInput(
      enteredAmount
    );


  if(
    !amount ||
    amount <= 0
  ){

    alert(
      'Ingresá un monto válido.'
    );

    return;
  }


  if(amount === payment.amount){
    return;
  }


  const linkedDue =
    (DB.paymentDues || [])
      .find(
        item=>
          item.paymentId ===
            paymentId
      );


  if(button){
    button.disabled = true;
    button.textContent =
      'Guardando...';
  }


  try{

    const { error: paymentError } =
      await supabaseClient

        .from('payments')

        .update({
          amount
        })

        .eq(
          'id',
          paymentId
        );


    if(paymentError){
      throw paymentError;
    }


    /*
      Si este pago nació al resolver
      un saldo pendiente, mantenemos
      ambos montos sincronizados.
    */
    if(linkedDue){

      const { error: dueError } =
        await supabaseClient

          .from('payment_dues')

          .update({
            amount
          })

          .eq(
            'id',
            linkedDue.id
          );


      if(dueError){

        /*
          Intentamos dejar el pago como
          estaba si no se pudo sincronizar
          el saldo relacionado.
        */
        await supabaseClient
          .from('payments')
          .update({
            amount:
              payment.amount
          })
          .eq(
            'id',
            paymentId
          );

        throw dueError;
      }
    }


    await loadAdminData();

    renderAdminPayments();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo modificar el pago.'
    );


    if(button){
      button.disabled = false;
      button.textContent =
        'Modificar';
    }

  }
}


async function deletePayment(
  paymentId,
  button
){

  if(
    button &&
    button.disabled
  ){
    return;
  }


  const payment =
    DB.payments.find(
      item=>item.id === paymentId
    );


  if(!payment){
    return;
  }


  const linkedDue =
    (DB.paymentDues || [])
      .find(
        item=>
          item.paymentId ===
            paymentId
      );


  const message =
    linkedDue

      ? (
          'Este pago proviene de un saldo pendiente resuelto. ' +
          'Si lo eliminás, ese saldo volverá a aparecer como pendiente.\n\n' +
          '¿Querés continuar?'
        )

      : (
          '¿Querés eliminar este pago de ' +
          fmtMoney(payment.amount) +
          '?'
        );


  if(
    !(
      await openAppConfirm(
        message,
        {
          title:'Eliminar pago',
          confirmText:'Eliminar'
        }
      )
    )
  ){
    return;
  }


  if(button){
    button.disabled = true;
    button.textContent =
      'Eliminando...';
  }


  try{

    /*
      Si estaba asociado a un saldo
      pendiente resuelto, primero lo
      devolvemos a pendiente y quitamos
      el vínculo con el pago.
    */
    if(linkedDue){

      const { error: dueError } =
        await supabaseClient

          .from('payment_dues')

          .update({
            status:
              'pending',

            resolved_at:
              null,

            payment_id:
              null
          })

          .eq(
            'id',
            linkedDue.id
          );


      if(dueError){
        throw dueError;
      }
    }


    const { error: deleteError } =
      await supabaseClient

        .from('payments')

        .delete()

        .eq(
          'id',
          paymentId
        );


    if(deleteError){

      if(linkedDue){
        await supabaseClient
          .from('payment_dues')
          .update({
            status:
              linkedDue.status,

            resolved_at:
              linkedDue.resolvedAt,

            payment_id:
              paymentId
          })
          .eq(
            'id',
            linkedDue.id
          );
      }

      throw deleteError;
    }


    await loadAdminData();

    renderAdminPayments();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo eliminar el pago.'
    );


    if(button){
      button.disabled = false;
      button.textContent =
        'Eliminar';
    }

  }
}


async function addPayment(){

  const studentId =
    document
      .getElementById(
        'payment-student'
      )
      .value;


  const student =
    DB.students.find(
      item=>item.id === studentId
    );


  const amount =
  parseMoneyInput(
    document
      .getElementById(
        'payment-amount'
      )
      .value
  );


  const method =
    document
      .getElementById(
        'payment-method'
      )
      .value;


  const date =
    document
      .getElementById(
        'payment-date'
      )
      .value;


  const description =
    document
      .getElementById(
        'payment-description'
      )
      .value
      .trim();


  if(!student){

    alert(
      'Elegí una alumna.'
    );

    return;
  }


  if(
    !amount ||
    amount <= 0
  ){

    alert(
      'Ingresá un monto válido.'
    );

    return;
  }


  if(!date){

    alert(
      'Elegí la fecha del pago.'
    );

    return;
  }


  try{

    const { error } =
      await supabaseClient

        .from('payments')

        .insert({

          student_id:
            student.id,

          student_name:
            student.name,

          amount,

          payment_method:
            method,

          payment_date:
            date,

          description

        });


    if(error){
      throw error;
    }


    await loadAdminData();

    renderAdminPayments();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo registrar el pago.'
    );

  }
}



async function addPaymentDue(){

  const studentId =
    document
      .getElementById(
        'due-student'
      )
      .value;


  const student =
    DB.students.find(
      item=>item.id === studentId
    );


  const amount =
  parseMoneyInput(
    document
      .getElementById(
        'due-amount'
      )
      .value
  );


  const date =
    document
      .getElementById(
        'due-date'
      )
      .value;


  const description =
    document
      .getElementById(
        'due-description'
      )
      .value
      .trim();


  if(!student){

    alert(
      'Elegí una alumna.'
    );

    return;
  }


  if(
    !amount ||
    amount <= 0
  ){

    alert(
      'Ingresá un monto pendiente válido.'
    );

    return;
  }


  if(!date){

    alert(
      'Elegí la fecha.'
    );

    return;
  }


  try{

    const { error } =
      await supabaseClient

        .from('payment_dues')

        .insert({

          student_id:
            student.id,

          student_name:
            student.name,

          amount,

          description,

          due_date:
            date,

          status:
            'pending'

        });


    if(error){
      throw error;
    }


    await loadAdminData();

    renderAdminPayments();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo registrar el saldo pendiente.'
    );

  }
}



async function resolvePaymentDue(
  id,
  button
){

  if(
    button &&
    button.disabled
  ){
    return;
  }


  const due =
    (DB.paymentDues || [])
      .find(
        item=>
          item.id === id &&
          item.status === 'pending'
      );


  if(!due){
    return;
  }


  const methodSelect =
    document.getElementById(
      'due-method-' + id
    );


  const method =
    methodSelect
      ? methodSelect.value
      : '';


  if(!method){

    alert(
      'Elegí si el pago fue en efectivo o por transferencia.'
    );

    if(methodSelect){
      methodSelect.focus();
    }

    return;
  }


  if(
    !(
      await openAppConfirm(
        '¿Confirmás que ' +
        due.studentName +
        ' pagó ' +
        fmtMoney(due.amount) +
        '?\n\nEl pago se agregará automáticamente al historial.',
        {
          title:'Confirmar pago',
          confirmText:'Sí, registrar pago',
          danger:false
        }
      )
    )
  ){
    return;
  }


  if(button){
    button.disabled = true;
    button.textContent =
      'Guardando...';
  }


  let createdPaymentId = null;
  let operationCompleted = false;


  try{

    const paymentDescription =
      due.description

        ? (
            'Saldo pendiente resuelto: ' +
            due.description
          )

        : 'Saldo pendiente resuelto';


    const {
      data: paymentRow,
      error: paymentError
    } =
      await supabaseClient

        .from('payments')

        .insert({

          student_id:
            due.studentId,

          student_name:
            due.studentName,

          amount:
            due.amount,

          payment_method:
            method,

          payment_date:
            todayISO(),

          description:
            paymentDescription

        })

        .select('id')

        .single();


    if(paymentError){
      throw paymentError;
    }


    createdPaymentId =
      paymentRow.id;


    const {
      data: updatedDue,
      error: dueError
    } =
      await supabaseClient

        .from('payment_dues')

        .update({

          status:
            'resolved',

          resolved_at:
            new Date()
              .toISOString(),

          payment_id:
            createdPaymentId

        })

        .eq(
          'id',
          id
        )

        .eq(
          'status',
          'pending'
        )

        .select('id')

        .maybeSingle();


    if(dueError){
      throw dueError;
    }


    if(!updatedDue){
      throw new Error(
        'Este saldo ya no está pendiente.'
      );
    }


    operationCompleted = true;


    try{

      await loadAdminData();

      renderAdminPayments();


    }catch(refreshError){

      console.error(
        'El pago se guardó, pero no se pudo recargar la pantalla:',
        refreshError
      );

      alert(
        'El pago se registró correctamente, pero no se pudo actualizar la pantalla. Recargá la página.'
      );

    }


  }catch(error){

    /*
      Si el pago llegó a crearse pero
      después falló la actualización del
      saldo, lo borramos para no dejar un
      cobro duplicado o incompleto.
    */
    if(
      createdPaymentId &&
      !operationCompleted
    ){

      const rollbackResult =
        await supabaseClient
          .from('payments')
          .delete()
          .eq(
            'id',
            createdPaymentId
          );

      if(rollbackResult.error){
        console.error(
          'No se pudo revertir el pago creado:',
          rollbackResult.error
        );
      }
    }


    showDatabaseError(
      error,
      'No se pudo resolver el saldo pendiente.'
    );


    if(button){
      button.disabled = false;
      button.textContent =
        'Marcar como resuelto';
    }

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
              accept="image/*,.heic,.heif"
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
          Podés subir JPG, PNG, WEBP,
          HEIC o HEIF. Las fotos se
          convierten y comprimen
          automáticamente antes de
          guardarse en Supabase Storage.
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

function isHeicImageFile(
  file
){

  if(!file){
    return false;
  }


  const type =
    String(
      file.type || ''
    )
      .toLowerCase();


  const name =
    String(
      file.name || ''
    )
      .toLowerCase();


  return (
    type === 'image/heic' ||
    type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );

}


function loadExternalScript(
  src
){

  return new Promise(
    (resolve,reject)=>{

      const existing =
        Array.from(
          document.scripts
        )
          .find(
            script=>
              script.src === src
          );


      if(existing){

        if(
          typeof window.heic2any ===
          'function'
        ){
          resolve();
          return;
        }


        existing.addEventListener(
          'load',
          ()=>resolve(),
          {
            once:true
          }
        );


        existing.addEventListener(
          'error',
          ()=>reject(
            new Error(
              'No se pudo cargar el conversor HEIC.'
            )
          ),
          {
            once:true
          }
        );

        return;
      }


      const script =
        document.createElement(
          'script'
        );

      script.src =
        src;

      script.async =
        true;

      script.onload =
        ()=>resolve();

      script.onerror =
        ()=>reject(
          new Error(
            'No se pudo cargar el conversor HEIC.'
          )
        );

      document.head
        .appendChild(
          script
        );

    }
  );

}


async function ensureHeicConverter(){

  if(
    typeof window.heic2any ===
    'function'
  ){
    return;
  }


  const sources = [
    'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js',
    'https://unpkg.com/heic2any@0.0.4/dist/heic2any.min.js'
  ];


  let lastError =
    null;


  for(
    const source
    of sources
  ){

    try{

      await loadExternalScript(
        source
      );


      if(
        typeof window.heic2any ===
        'function'
      ){
        return;
      }

    }catch(error){

      lastError =
        error;

    }

  }


  const error =
    new Error(
      'No se pudo cargar el conversor para imágenes HEIC/HEIF. Revisá la conexión a internet e intentá nuevamente.'
    );

  error.code =
    'HEIC_CONVERTER_UNAVAILABLE';

  error.cause =
    lastError;

  throw error;

}


async function convertHeicToJpeg(
  file
){

  await ensureHeicConverter();


  try{

    let converted =
      await window.heic2any({
        blob:file,
        toType:'image/jpeg',
        quality:0.92
      });


    if(
      Array.isArray(
        converted
      )
    ){

      converted =
        converted[0];

    }


    if(
      !(converted instanceof Blob)
    ){

      throw new Error(
        'El conversor no devolvió una imagen válida.'
      );

    }


    return new File(
      [
        converted
      ],
      String(
        file.name ||
        'imagen'
      )
        .replace(
          /\.(heic|heif)$/i,
          ''
        ) +
        '.jpg',
      {
        type:'image/jpeg',
        lastModified:
          Date.now()
      }
    );


  }catch(originalError){

    const error =
      new Error(
        'No se pudo convertir la imagen HEIC/HEIF. Probá nuevamente o elegí otra foto.'
      );

    error.code =
      'HEIC_CONVERSION_FAILED';

    error.cause =
      originalError;

    throw error;

  }

}


function resizeRasterImageFile(
  file,
  maxSize = 900,
  quality = 0.78
){

  return new Promise(
    (resolve,reject)=>{

      const reader =
        new FileReader();


      reader.onerror = ()=>{

        const error =
          new Error(
            'No se pudo leer el archivo.'
          );

        error.code =
          'IMAGE_READ_FAILED';

        reject(
          error
        );

      };


      reader.onload = ()=>{

        const image =
          new Image();


        image.onerror = ()=>{

          const error =
            new Error(
              'No se pudo procesar el formato de la imagen.'
            );

          error.code =
            'IMAGE_DECODE_FAILED';

          reject(
            error
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

            width =
              maxSize;

          }else if(
            height > maxSize
          ){

            width =
              Math.round(
                width *
                maxSize /
                height
              );

            height =
              maxSize;

          }


          const canvas =
            document.createElement(
              'canvas'
            );

          canvas.width =
            width;

          canvas.height =
            height;


          const context =
            canvas.getContext(
              '2d'
            );


          if(!context){

            const error =
              new Error(
                'No se pudo preparar la imagen.'
              );

            error.code =
              'IMAGE_CANVAS_FAILED';

            reject(
              error
            );

            return;
          }


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

                resolve(
                  blob
                );

              }else{

                const error =
                  new Error(
                    'No se pudo comprimir la imagen.'
                  );

                error.code =
                  'IMAGE_COMPRESS_FAILED';

                reject(
                  error
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


      reader.readAsDataURL(
        file
      );

    }
  );

}


async function resizeImageFile(
  file,
  maxSize = 900,
  quality = 0.78
){

  if(!file){

    const error =
      new Error(
        'No se seleccionó ninguna imagen.'
      );

    error.code =
      'IMAGE_MISSING';

    throw error;

  }


  let sourceFile =
    file;


  if(
    isHeicImageFile(
      file
    )
  ){

    sourceFile =
      await convertHeicToJpeg(
        file
      );

  }


  return resizeRasterImageFile(
    sourceFile,
    maxSize,
    quality
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


    let userMessage =
      'No se pudo subir la foto.';


    if(
      error &&
      (
        error.code ===
          'HEIC_CONVERTER_UNAVAILABLE' ||
        error.code ===
          'HEIC_CONVERSION_FAILED'
      )
    ){

      userMessage =
        error.message;

    }else if(
      error &&
      (
        error.code ===
          'IMAGE_READ_FAILED' ||
        error.code ===
          'IMAGE_DECODE_FAILED' ||
        error.code ===
          'IMAGE_CANVAS_FAILED' ||
        error.code ===
          'IMAGE_COMPRESS_FAILED'
      )
    ){

      userMessage =
        'No pudimos procesar esa imagen. Probá nuevamente o elegí otra foto.';

    }else{

      const databaseMessage =
        String(
          error &&
          error.message
            ? error.message
            : ''
        )
          .toLowerCase();


      if(
        databaseMessage.includes(
          'bucket'
        ) ||
        databaseMessage.includes(
          'storage'
        ) ||
        databaseMessage.includes(
          'row-level security'
        ) ||
        databaseMessage.includes(
          'policy'
        )
      ){

        userMessage =
          'La imagen se pudo procesar, pero Supabase no permitió guardarla. Revisá el bucket "gallery" y sus permisos.';

      }else if(
        databaseMessage
      ){

        userMessage =
          'No se pudo guardar la foto. ' +
          error.message;

      }

    }


    messageBox.innerHTML = `
      <div class="error-box">
        ${escapeHTML(userMessage)}
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
    !(
      await openAppConfirm(
        '¿Querés eliminar esta foto de la galería?',
        {
          title:'Eliminar foto',
          confirmText:'Eliminar'
        }
      )
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

/* ---------- CLASES Y PROMOCIONES ---------- */

function optionalPriceValue(inputId){

  const input =
    document.getElementById(
      inputId
    );


  if(!input){
    return null;
  }


  if(
    input.value.trim() === ''
  ){
    return null;
  }


  const number =
    parseMoneyInput(
      input.value
    );


  if(
    number === null ||
    number < 0
  ){
    return null;
  }


  return number;
}

function renderAdminPricing(){

  document.getElementById(
    'admin-main'
  ).innerHTML = `

    <h2>
      Clases y promociones
    </h2>

    <p
      class="lede"
      style="margin-bottom:22px;"
    >
      Administrá las clases que ofrecés,
      sus precios y promociones.
      El precio es opcional.
    </p>


    <div class="panel">

      <h3>
        Clases
      </h3>

      <div class="table-scroll">

        <table class="admin-table">

          <tr>
            <th>Nombre</th>
            <th>Descripción</th>
            <th>Precio</th>
            <th>Estado</th>
            <th></th>
          </tr>


          ${
            DB.services.map(service=>`

              <tr>

                <td>

                  <input
                    id="service-name-${service.id}"
                    value="${escapeHTML(service.name)}"
                    style="width:100%;min-width:150px;"
                  >

                </td>


                <td>

                  <input
                    id="service-desc-${service.id}"
                    value="${escapeHTML(service.desc)}"
                    placeholder="Descripción opcional"
                    style="width:100%;min-width:190px;"
                  >

                </td>


                <td>

                  <input
  type="text"
  inputmode="decimal"
  id="service-price-${service.id}"
  value="${
    service.price === null
      ? ''
      : formatMoneyInputValue(
          service.price
        )
  }"
  placeholder="Opcional"
  style="width:120px;"
  oninput="formatMoneyField(this)"
>

                </td>


                <td>

                  <span
                    class="pill ${
                      service.active
                        ? 'confirmed'
                        : 'cancelled'
                    }"
                  >

                    ${
                      service.active
                        ? 'Activa'
                        : 'Oculta'
                    }

                  </span>

                </td>


                <td class="btnrow">

                  <button
                    class="mini-btn"
                    onclick="saveService('${service.id}')"
                  >
                    Guardar
                  </button>


                  <button
                    class="mini-btn"
                    onclick="toggleService('${service.id}')"
                  >

                    ${
                      service.active
                        ? 'Ocultar'
                        : 'Activar'
                    }

                  </button>


                  <button
                    class="mini-btn no"
                    onclick="removeService('${service.id}')"
                  >
                    Eliminar
                  </button>

                </td>

              </tr>

            `).join('') ||

            `
              <tr>

                <td colspan="5">

                  <div class="empty">
                    Todavía no hay
                    clases cargadas.
                  </div>

                </td>

              </tr>
            `
          }

        </table>

      </div>


      <h4 style="margin-top:20px;">
        Agregar clase
      </h4>


      <div class="inline-form">

        <div class="f">

          <label>
            Nombre
          </label>

          <input
            id="new-service-name"
            placeholder="Ej: Clase de manejo"
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
            Descripción (opcional)
          </label>

          <input
            id="new-service-desc"
            placeholder="Ej: Práctica personalizada"
          >

        </div>


        <div class="f">

          <label>
            Precio (opcional)
          </label>

          <input
  type="text"
  inputmode="decimal"
  id="new-service-price"
  placeholder="Dejar vacío"
  style="width:140px;"
  oninput="formatMoneyField(this)"
>

        </div>


        <button
          class="mini-btn"
          onclick="addService()"
        >
          Agregar clase
        </button>

      </div>

    </div>



    <div class="panel">

      <h3>
        Promociones
      </h3>


      ${
        DB.promos.map(p=>`

          <div
            class="promo-card"
            style="
              background:${
                p.active
                  ? 'linear-gradient(135deg,var(--amber),var(--amber-dk))'
                  : 'var(--cream-dim)'
              };
              color:${
                p.active
                  ? 'var(--asphalt)'
                  : 'var(--ink-soft)'
              };
              margin-bottom:14px;
            "
          >

            <div style="width:100%;">


              <div class="inline-form">


                <div class="f">

                  <label>
                    Título
                  </label>

                  <input
                    id="promo-title-${p.id}"
                    value="${escapeHTML(p.title)}"
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
                    id="promo-desc-${p.id}"
                    value="${escapeHTML(p.desc)}"
                  >

                </div>


                <div class="f">

                  <label>
                    Precio (opcional)
                  </label>

                  <input
  type="text"
  inputmode="decimal"
  id="promo-price-${p.id}"
  value="${
    p.price === null
      ? ''
      : formatMoneyInputValue(
          p.price
        )
  }"
  placeholder="Opcional"
  style="width:130px;"
  oninput="formatMoneyField(this)"
>

                </div>


                <div class="f">

                  <label>
                    Etiqueta
                  </label>

                  <input
                    id="promo-badge-${p.id}"
                    value="${escapeHTML(p.badge)}"
                    placeholder="Opcional"
                  >

                </div>

              </div>


              <div
                class="
                  promo-admin-image-row
                "
              >

                <div
                  class="
                    promo-admin-preview
                  "
                >
                  ${
                    promoArtworkHTML(
                      p,
                      DB.promos.indexOf(
                        p
                      ),
                      {
                        admin:true
                      }
                    )
                  }
                </div>


                <div
                  class="
                    promo-admin-image-controls
                  "
                >

                  <label
                    for="
                      promo-image-${p.id}
                    "
                  >
                    Imagen
                    (opcional)
                  </label>

                  <input
                    id="
                      promo-image-${p.id}
                    "
                    type="file"
                    accept="image/*"
                  >

                  <p class="note">
                    Si no cargás una imagen,
                    se usa automáticamente
                    una ilustración del diseño
                    con un color diferente.
                  </p>

                  ${
                    p.image
                      ? `
                          <button
                            class="
                              mini-btn
                              no
                            "
                            type="button"
                            onclick="
                              removePromoImage(
                                '${p.id}'
                              )
                            "
                          >
                            Quitar imagen
                          </button>
                        `
                      : ''
                  }

                </div>

              </div>


              <div
                class="btnrow"
                style="margin-top:10px;"
              >

                <button
                  class="mini-btn"
                  onclick="savePromo('${p.id}')"
                >
                  Guardar
                </button>


                <button
                  class="mini-btn"
                  onclick="togglePromo('${p.id}')"
                >

                  ${
                    p.active
                      ? 'Ocultar'
                      : 'Activar'
                  }

                </button>


                <button
                  class="mini-btn no"
                  onclick="removePromo('${p.id}')"
                >
                  Eliminar
                </button>

              </div>

            </div>

          </div>

        `).join('') ||

        `
          <div class="empty">
            No hay promociones cargadas.
          </div>
        `
      }


      <h4 style="margin-top:20px;">
        Nueva promoción
      </h4>


      <div class="field">

        <label>
          Título
        </label>

        <input
          id="new-promo-title"
        >

      </div>


      <div class="field">

        <label>
          Descripción
        </label>

        <input
          id="new-promo-desc"
        >

      </div>


      <div class="field">

        <label>
          Precio promocional (opcional)
        </label>

        <input
  type="text"
  inputmode="decimal"
  id="new-promo-price"
  placeholder="Dejar vacío si no querés mostrar precio"
  oninput="formatMoneyField(this)"
>

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


      <div class="field">

        <label>
          Imagen (opcional)
        </label>

        <input
          id="new-promo-image"
          type="file"
          accept="image/*"
        >

        <p class="note">
          Si la dejás vacía,
          la página mostrará una
          ilustración automática
          del mismo diseño con
          distintos colores.
        </p>

      </div>


      <button
        class="cta-btn small"
        onclick="addPromo()"
      >
        Agregar promoción
      </button>

    </div>
  `;
}

async function saveService(id){

  const name =
    document
      .getElementById(
        'service-name-' + id
      )
      .value
      .trim();


  if(!name){

    alert(
      'La clase necesita un nombre.'
    );

    return;
  }


  try{

    const { error } =
      await supabaseClient

        .from('services')

        .update({

          name,

          description:
            document
              .getElementById(
                'service-desc-' + id
              )
              .value
              .trim(),

          price:
            optionalPriceValue(
              'service-price-' + id
            )

        })

        .eq(
          'id',
          id
        );


    if(error){
      throw error;
    }


    await loadAdminData();

    renderAdminPricing();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo guardar la clase.'
    );

  }
}

async function toggleService(id){

  const service =
    DB.services.find(
      item=>item.id === id
    );


  if(!service){
    return;
  }


  try{

    const { error } =
      await supabaseClient

        .from('services')

        .update({
          active:!service.active
        })

        .eq(
          'id',
          id
        );


    if(error){
      throw error;
    }


    await loadAdminData();

    renderAdminPricing();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo cambiar el estado de la clase.'
    );

  }
}

async function removeService(id){

  const service =
    DB.services.find(
      item=>item.id === id
    );


  if(!service){
    return;
  }


  if(
    !(
      await openAppConfirm(
        '¿Querés eliminar la clase "' +
        service.name +
        '"? Las reservas anteriores ' +
        'conservarán el nombre de la clase.',
        {
          title:'Eliminar clase',
          confirmText:'Eliminar'
        }
      )
    )
  ){
    return;
  }


  try{

    const { error } =
      await supabaseClient

        .from('services')

        .delete()

        .eq(
          'id',
          id
        );


    if(error){
      throw error;
    }


    await loadAdminData();

    renderAdminPricing();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo eliminar la clase.'
    );

  }
}

async function addService(){

  const name =
    document
      .getElementById(
        'new-service-name'
      )
      .value
      .trim();


  if(!name){

    alert(
      'Escribí el nombre de la clase.'
    );

    return;
  }


  try{

    const { error } =
      await supabaseClient

        .from('services')

        .insert({

          id:uid('service'),

          name,

          service_type:
            'class',

          classes:
            null,

          price:
            optionalPriceValue(
              'new-service-price'
            ),

          description:
            document
              .getElementById(
                'new-service-desc'
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
      'No se pudo agregar la clase.'
    );

  }
}

async function savePromo(id){

  const promo =
    DB.promos.find(
      item=>item.id === id
    );


  if(!promo){
    return;
  }


  const title =
    document
      .getElementById(
        'promo-title-' + id
      )
      .value
      .trim();


  if(!title){

    alert(
      'La promoción necesita un título.'
    );

    return;
  }


  const imageInput =
    document.getElementById(
      'promo-image-' + id
    );


  const newImageFile =
    imageInput &&
    imageInput.files
      ? imageInput.files[0]
      : null;


  let uploadedImage =
    null;


  try{

    if(newImageFile){

      uploadedImage =
        await uploadPromoImageFile(
          newImageFile
        );

    }


    const updateData = {

      title,

      description:
        document
          .getElementById(
            'promo-desc-' + id
          )
          .value
          .trim(),

      badge:
        document
          .getElementById(
            'promo-badge-' + id
          )
          .value
          .trim(),

      price:
        optionalPriceValue(
          'promo-price-' + id
        )

    };


    if(uploadedImage){

      updateData.image_url =
        uploadedImage.imageUrl;

      updateData.storage_path =
        uploadedImage.storagePath;

    }


    const { error } =
      await supabaseClient
        .from('promos')
        .update(
          updateData
        )
        .eq(
          'id',
          id
        );


    if(error){

      if(
        uploadedImage &&
        uploadedImage.storagePath
      ){

        await deletePromoStorageImage(
          uploadedImage.storagePath
        );

      }

      throw error;
    }


    if(
      uploadedImage &&
      promo.storagePath
    ){

      await deletePromoStorageImage(
        promo.storagePath
      );

    }


    await loadAdminData();

    renderAdminPricing();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo guardar la promoción.'
    );

  }
}


async function removePromoImage(
  id
){

  const promo =
    DB.promos.find(
      item=>item.id === id
    );


  if(
    !promo ||
    !promo.image
  ){
    return;
  }


  if(
    !(
      await openAppConfirm(
        '¿Querés quitar la imagen de esta promoción? Se usará una ilustración automática.',
        {
          title:'Quitar imagen',
          confirmText:'Quitar imagen'
        }
      )
    )
  ){
    return;
  }


  try{

    const { error } =
      await supabaseClient
        .from('promos')
        .update({
          image_url:null,
          storage_path:null
        })
        .eq(
          'id',
          id
        );


    if(error){
      throw error;
    }


    if(promo.storagePath){

      await deletePromoStorageImage(
        promo.storagePath
      );

    }


    await loadAdminData();

    renderAdminPricing();


  }catch(error){

    showDatabaseError(
      error,
      'No se pudo quitar la imagen de la promoción.'
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
          active:!promo.active
        })

        .eq(
          'id',
          id
        );


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

  const promo =
    DB.promos.find(
      item=>item.id === id
    );


  if(!promo){
    return;
  }


  if(
    !(
      await openAppConfirm(
        '¿Querés eliminar esta promoción?',
        {
          title:'Eliminar promoción',
          confirmText:'Eliminar'
        }
      )
    )
  ){
    return;
  }


  try{

    const { error } =
      await supabaseClient
        .from('promos')
        .delete()
        .eq(
          'id',
          id
        );


    if(error){
      throw error;
    }


    if(promo.storagePath){

      await deletePromoStorageImage(
        promo.storagePath
      );

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

    alert(
      'Escribí el título de la promoción.'
    );

    return;
  }


  const imageInput =
    document.getElementById(
      'new-promo-image'
    );


  const imageFile =
    imageInput &&
    imageInput.files
      ? imageInput.files[0]
      : null;


  let uploadedImage =
    null;


  try{

    if(imageFile){

      uploadedImage =
        await uploadPromoImageFile(
          imageFile
        );

    }


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

          price:
            optionalPriceValue(
              'new-promo-price'
            ),

          image_url:
            uploadedImage
              ? uploadedImage.imageUrl
              : null,

          storage_path:
            uploadedImage
              ? uploadedImage.storagePath
              : null,

          active:
            true

        });


    if(error){

      if(
        uploadedImage &&
        uploadedImage.storagePath
      ){

        await deletePromoStorageImage(
          uploadedImage.storagePath
        );

      }

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
function adminFaqCardsHTML(){
  const faqs =
    (
      DB.settings &&
      Array.isArray(DB.settings.faqs)
    )
      ? DB.settings.faqs
      : [];

  if(!faqs.length){
    return `
      <div class="empty">
        Todavía no hay preguntas frecuentes.
      </div>
    `;
  }

  return faqs
    .map(item=>`
      <div
        style="
          border:1px solid var(--line);
          border-radius:10px;
          padding:16px;
          margin-bottom:12px;
          background:var(--paper);
        "
      >
        <div
          style="
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:14px;
            flex-wrap:wrap;
          "
        >
          <div
            style="
              min-width:0;
              flex:1 1 320px;
            "
          >
            <strong>
              ${escapeHTML(item.question)}
            </strong>

            <p
              class="note"
              style="
                margin:8px 0 0;
                white-space:pre-wrap;
              "
            >
              ${escapeHTML(item.answer)}
            </p>
          </div>

          <div class="btnrow">
            <button
              type="button"
              class="mini-btn"
              onclick="editFaqItem('${item.id}')"
            >
              Modificar
            </button>

            <button
              type="button"
              class="mini-btn no"
              onclick="deleteFaqItem('${item.id}')"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    `)
    .join('');
}

function openFaqEditorModal({
  title = 'Pregunta frecuente',
  question = '',
  answer = ''
} = {}){
  return new Promise(resolve=>{
    const previous =
      document.getElementById(
        'faq-editor-modal'
      );

    if(previous){
      previous.remove();
    }

    const overlay =
      document.createElement(
        'div'
      );

    overlay.id =
      'faq-editor-modal';

    overlay.setAttribute(
      'role',
      'dialog'
    );

    overlay.setAttribute(
      'aria-modal',
      'true'
    );

    overlay.style.cssText = `
      position:fixed;
      inset:0;
      z-index:100000;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
      background:rgba(8,16,28,.68);
    `;

    overlay.innerHTML = `
      <div
        style="
          width:min(100%,560px);
          max-height:calc(100vh - 40px);
          overflow:auto;
          background:var(--paper);
          border-radius:14px;
          padding:24px;
          box-shadow:0 24px 70px rgba(0,0,0,.24);
        "
      >
        <h3 style="margin:0 0 20px;">
          ${escapeHTML(title)}
        </h3>

        <div class="field">
          <label>Pregunta</label>
          <input
            id="faq-editor-question"
            value="${escapeHTML(question)}"
            placeholder="Escribí la pregunta"
          >
        </div>

        <div class="field">
          <label>Respuesta</label>
          <textarea
            id="faq-editor-answer"
            rows="5"
            placeholder="Escribí la respuesta"
          >${escapeHTML(answer)}</textarea>
        </div>

        <div
          class="btnrow"
          style="
            justify-content:flex-end;
            margin-top:20px;
          "
        >
          <button
            type="button"
            class="mini-btn"
            id="faq-editor-cancel"
          >
            Cancelar
          </button>

          <button
            type="button"
            class="mini-btn ok"
            id="faq-editor-save"
          >
            Guardar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const questionInput =
      document.getElementById(
        'faq-editor-question'
      );

    const answerInput =
      document.getElementById(
        'faq-editor-answer'
      );

    const close = value=>{
      document.removeEventListener(
        'keydown',
        onKeyDown
      );
      overlay.remove();
      resolve(value);
    };

    const onKeyDown = event=>{
      if(event.key === 'Escape'){
        close(null);
      }
    };

    document.addEventListener(
      'keydown',
      onKeyDown
    );

    document
      .getElementById(
        'faq-editor-cancel'
      )
      .onclick = ()=>close(null);

    document
      .getElementById(
        'faq-editor-save'
      )
      .onclick = ()=>{
        const newQuestion =
          questionInput.value.trim();
        const newAnswer =
          answerInput.value.trim();

        if(!newQuestion || !newAnswer){
          alert(
            'Completá la pregunta y la respuesta.'
          );
          return;
        }

        close({
          question:newQuestion,
          answer:newAnswer
        });
      };

    overlay.addEventListener(
      'click',
      event=>{
        if(event.target === overlay){
          close(null);
        }
      }
    );

    setTimeout(
      ()=>questionInput.focus(),
      30
    );
  });
}

async function saveFaqItems(faqs){
  const { error } =
    await supabaseClient
      .from('site_settings')
      .update({
        faqs,
        updated_at:
          new Date().toISOString()
      })
      .eq('id', 1);

  if(error){
    throw error;
  }
}

async function addFaqItem(){
  const result =
    await openFaqEditorModal({
      title:'Agregar pregunta frecuente'
    });

  if(!result){
    return;
  }

  const faqs = [
    ...(DB.settings.faqs || []),
    {
      id:'faq-' + Date.now(),
      question:result.question,
      answer:result.answer
    }
  ];

  try{
    await saveFaqItems(faqs);
    await loadAdminData();
    renderAdminSettings();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo agregar la pregunta frecuente.'
    );
  }
}

async function editFaqItem(id){
  const item =
    (DB.settings.faqs || [])
      .find(faq=>faq.id === id);

  if(!item){
    return;
  }

  const result =
    await openFaqEditorModal({
      title:'Modificar pregunta frecuente',
      question:item.question,
      answer:item.answer
    });

  if(!result){
    return;
  }

  const faqs =
    (DB.settings.faqs || [])
      .map(
        faq=>
          faq.id === id
            ? {
                ...faq,
                question:result.question,
                answer:result.answer
              }
            : faq
      );

  try{
    await saveFaqItems(faqs);
    await loadAdminData();
    renderAdminSettings();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo modificar la pregunta frecuente.'
    );
  }
}

async function deleteFaqItem(id){
  const item =
    (DB.settings.faqs || [])
      .find(faq=>faq.id === id);

  if(!item){
    return;
  }

  if(
    !(
      await openAppConfirm(
        '¿Querés eliminar esta pregunta frecuente?',
        {
          title:'Eliminar pregunta',
          confirmText:'Eliminar'
        }
      )
    )
  ){
    return;
  }

  const faqs =
    (DB.settings.faqs || [])
      .filter(faq=>faq.id !== id);

  try{
    await saveFaqItems(faqs);
    await loadAdminData();
    renderAdminSettings();
  }catch(error){
    showDatabaseError(
      error,
      'No se pudo eliminar la pregunta frecuente.'
    );
  }
}

function renderAdminSettings(){
  const settings = DB.settings;

  document
    .getElementById(
      'admin-main'
    )
    .innerHTML = `
      <h2>Ajustes del sitio</h2>

      <p
        class="lede"
        style="margin-bottom:22px;"
      >
        Administrá los datos de contacto
        y las preguntas frecuentes que
        aparecen en la página pública.
      </p>

      <div class="panel">
        <h3>Datos generales</h3>

        <div class="field">
          <label>
            Número de WhatsApp
            (con código de país,
            sin espacios ni +)
          </label>
          <input
            id="set-wa"
            value="${escapeHTML(settings.whatsapp)}"
          >
        </div>

        <div class="field">
          <label>Usuario de Instagram</label>
          <input
            id="set-ig"
            value="${escapeHTML(settings.instagram)}"
          >
        </div>

        <div class="field">
          <label>Zonas de cobertura</label>
          <textarea
            id="set-zonas"
            rows="3"
          >${escapeHTML(settings.zonas)}</textarea>
        </div>

        <button
          class="cta-btn"
          onclick="saveSettings()"
        >
          Guardar datos generales
        </button>

        <div id="settings-msg"></div>
      </div>

      <div class="panel">
        <div
          style="
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:14px;
            flex-wrap:wrap;
            margin-bottom:18px;
          "
        >
          <div>
            <h3 style="margin-bottom:6px;">
              Preguntas frecuentes
            </h3>
            <p class="note" style="margin:0;">
              Podés agregar, modificar o eliminar
              preguntas y respuestas cuando quieras.
            </p>
          </div>

          <button
            type="button"
            class="mini-btn ok"
            onclick="addFaqItem()"
          >
            Agregar pregunta
          </button>
        </div>

        <div>
          ${adminFaqCardsHTML()}
        </div>
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
              .getElementById('set-wa')
              .value
              .trim(),
          instagram:
            document
              .getElementById('set-ig')
              .value
              .trim(),
          zones:
            document
              .getElementById('set-zonas')
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

    if(messageBox){
      messageBox.innerHTML = `
        <div class="success-box">
          Datos generales guardados.
        </div>
      `;
    }

    renderContact();
    renderFAQ();
  }catch(error){
    console.error(
      'No se pudieron guardar los ajustes:',
      error
    );

    if(messageBox){
      messageBox.innerHTML = `
        <div class="error-box">
          No se pudieron guardar los ajustes.
        </div>
      `;
    }
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

  ensurePublicOnePageStyles();
  renderPublicNav();
  buildPublicSections();

  try{
    await renderAllPublicSections();
  }catch(error){
    console.error(
      'No se pudieron renderizar todas las secciones públicas:',
      error
    );
  }

  const savedView =
    sessionStorage.getItem(
      NAV_STATE_KEYS.view
    ) || 'public';

  if(savedView === 'admin'){

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

    if(adminAuthed){
      showAdminDashboard();
    }else{
      showAdminLogin();
    }

    return;
  }

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

  await goPublic(
    getSavedPublicSection()
  );
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