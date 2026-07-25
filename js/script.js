document.getElementById('year').textContent = new Date().getFullYear();

/* ==================================================================
   ESTADO / PERSISTENCIA
   ================================================================== */
const DOW = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const SERVICE_LABELS = { suelta:'Clase suelta de perfeccionamiento', curso:'Curso integral - Mi Primera Licencia' };

function uid(p){ return p + '_' + Math.random().toString(36).slice(2,9); }
function todayISO(){ return toISO(new Date()); }
function toISO(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function fmtMoney(n){ return '$' + Number(n).toLocaleString('es-AR'); }
function fmtDateHuman(iso){
  const [y,m,d] = iso.split('-').map(Number);
  return d + ' de ' + MONTHS[m-1] + ' de ' + y;
}

function normalizeArgentineWhatsApp(phone){
  let digits = String(phone || '').replace(/\D/g, '');

  if(!digits){
    return '';
  }

  // Elimina el prefijo internacional 00
  if(digits.startsWith('00')){
    digits = digits.slice(2);
  }

  // Ya está en formato correcto: 549 + 10 dígitos
  if(digits.startsWith('549') && digits.length === 13){
    return digits;
  }

  // Formato +54 9
  if(digits.startsWith('549')){
    digits = digits.slice(3);
  }

  // Formato +54 sin el 9
  else if(digits.startsWith('54')){
    digits = digits.slice(2);

    if(digits.startsWith('9')){
      digits = digits.slice(1);
    }
  }

  // Elimina el 0 inicial del código de área
  if(digits.startsWith('0')){
    digits = digits.slice(1);
  }

  // Código de área + número deben sumar 10 dígitos
  if(digits.length !== 10){
    return '';
  }

  return '549' + digits;
}

function waLink(phone, text){
  const normalizedPhone = normalizeArgentineWhatsApp(phone);

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
  // Horarios de atención por defecto (100% editables luego desde el panel > Agenda).
  // Lunes a viernes 9 a 12 y 15 a 19, sábados 9 a 13, domingo cerrado.
  const avail = {};
  const d = new Date();
  for(let i=1;i<=45;i++){
    const dd = new Date(d); dd.setDate(d.getDate()+i);
    const dow = dd.getDay();
    if(dow===0) continue; // domingo cerrado
    avail[toISO(dd)] = dow===6 ? ['09:00','10:00','11:00','12:00'] : ['09:00','10:00','11:00','15:00','16:00','17:00','18:00'];
  }
  return {
    services:{
      suelta:{ price:12000, desc:'Clase de perfeccionamiento individual de 45 minutos, en el auto de la alumna.' },
      curso:{ price:130000, desc:'Preparación teórica para el examen + práctica de manejo completa, a tu ritmo.' },
      packs:[
        { id:uid('pack'), name:'Pack 5 clases', classes:5, price:55000 },
        { id:uid('pack'), name:'Pack 10 clases', classes:10, price:100000 }
      ]
    },
    promos:[],
    settings:{
      whatsapp:'5493816784411',
      instagram:'clases_de_manejotuc',
      zonas:'Trabajamos en toda la zona de San Miguel de Tucumán. Buscamos y dejamos a la alumna en su domicilio dentro de estas zonas.',
      requisitos:'Tener 17 años o más (con autorización de un adulto responsable si sos menor), DNI, y muchas ganas de aprender. No hace falta experiencia previa ni licencia de conducir para empezar.',
      autoPropio:'Sí: las clases se dictan siempre en el auto de la alumna, no manejamos autos de la escuela. Es obligatorio contar con un vehículo propio o familiar en condiciones de circular, con seguro vigente y cédula al día.',
      cancelacion:'Podés reprogramar o cancelar tu clase sin costo avisando con al menos 12 horas de anticipación. Las cancelaciones con menos aviso pueden reprogramarse una vez; a partir de la segunda, se descuenta la clase del pack.'
    },
    schedule:{ availability: avail, blocked:{} },
    bookings:[],
    students:[],
    reviews:[],
    messages:[],
    gallery:[]
  };
}

let DB = null;
let dbReady = false;

const STORAGE_KEY = 'clases_manejo_tuc_db';

async function loadDB(){
  try{
    const savedData = localStorage.getItem(STORAGE_KEY);

    if(savedData){
      DB = JSON.parse(savedData);
    }else{
      DB = defaultDB();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
    }
  }catch(error){
    console.error('No se pudieron cargar los datos:', error);

    DB = defaultDB();

    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
    }catch(storageError){
      console.error(
        'No se pudo crear la base de datos local:',
        storageError
      );
    }
  }

  /*
    MIGRACIONES

    Esto evita errores si ya había información guardada
    con una versión anterior del sistema.
  */

  const defaults = defaultDB();

  if(!DB.services){
    DB.services = defaults.services;
  }

  if(!DB.services.suelta){
    DB.services.suelta = defaults.services.suelta;
  }

  if(!DB.services.curso){
    DB.services.curso = defaults.services.curso;
  }

  if(!Array.isArray(DB.services.packs)){
    DB.services.packs = defaults.services.packs;
  }

  if(!Array.isArray(DB.promos)){
    DB.promos = [];
  }

  if(!DB.settings){
    DB.settings = defaults.settings;
  }

  if(!DB.settings.whatsapp){
    DB.settings.whatsapp = defaults.settings.whatsapp;
  }

  if(!DB.settings.instagram){
    DB.settings.instagram = defaults.settings.instagram;
  }

  if(!DB.settings.zonas){
    DB.settings.zonas = defaults.settings.zonas;
  }

  if(!DB.settings.requisitos){
    DB.settings.requisitos = defaults.settings.requisitos;
  }

  if(!DB.settings.autoPropio){
    DB.settings.autoPropio = defaults.settings.autoPropio;
  }

  if(!DB.settings.cancelacion){
    DB.settings.cancelacion = defaults.settings.cancelacion;
  }

  if(!DB.schedule){
    DB.schedule = defaults.schedule;
  }

  if(!DB.schedule.availability){
    DB.schedule.availability = defaults.schedule.availability;
  }

  if(!DB.schedule.blocked){
    DB.schedule.blocked = {};
  }

  if(!Array.isArray(DB.bookings)){
    DB.bookings = [];
  }

  if(!Array.isArray(DB.students)){
    DB.students = [];
  }

  if(!Array.isArray(DB.reviews)){
    DB.reviews = [];
  }

  if(!Array.isArray(DB.messages)){
    DB.messages = [];
  }

  if(!Array.isArray(DB.gallery)){
    DB.gallery = [];
  }

  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
  }catch(error){
    console.error(
      'No se pudieron guardar las migraciones:',
      error
    );
  }

  dbReady = true;
}


/*
  CONTROL DE GUARDADO

  Impide que dos acciones intenten guardar
  simultáneamente.
*/
let saving = false;
let saveQueued = false;


/*
  GUARDAR BASE DE DATOS

  Todas las funciones existentes pueden continuar usando:

  await saveDB();

  No es necesario modificar removeSlot(), addSlot(),
  reservas, precios, promociones, reseñas ni ajustes.
*/
async function saveDB(){
  if(!DB){
    console.error(
      'No se puede guardar porque la base de datos todavía no está cargada.'
    );

    return false;
  }

  if(saving){
    saveQueued = true;
    return true;
  }

  saving = true;

  let savedSuccessfully = true;

  try{
    const data = JSON.stringify(DB);

    localStorage.setItem(STORAGE_KEY, data);
  }catch(error){
    savedSuccessfully = false;

    console.error(
      'No se pudo guardar la información:',
      error
    );

    /*
      El error más frecuente en este punto sería que
      localStorage se quedó sin espacio, especialmente
      por las imágenes de la galería.
    */
    if(
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    ){
      alert(
        'No se pudo guardar porque el almacenamiento del navegador está lleno. Probá eliminando alguna foto de la galería.'
      );
    }
  }finally{
    saving = false;
  }

  /*
    Si se intentó guardar nuevamente mientras había
    otro guardado en curso, ejecutamos el guardado pendiente.
  */
  if(saveQueued){
    saveQueued = false;
    await saveDB();
  }

  return savedSuccessfully;
}

/* ==================================================================
   NAVEGACIÓN PÚBLICA
   ================================================================== */
const PUB_SECTIONS = [
  { id:'inicio', label:'Inicio' },
  { id:'servicios', label:'Servicios y precios' },
  { id:'reservas', label:'Reservas' },
  { id:'galeria', label:'Egresadas' },
  { id:'resenas', label:'Reseñas' },
  { id:'faq', label:'Preguntas frecuentes' },
  { id:'contacto', label:'Contacto' }
];
let currentPub = 'inicio';

function toggleMobileNav(){
  document.getElementById('pub-nav').classList.toggle('open');
}
function goPublic(id){
  currentPub = id;
  document.querySelectorAll('#pub-nav button').forEach(b=> b.classList.toggle('active', b.dataset.id===id));
  document.querySelectorAll('#pub-sections > section').forEach(s=> s.classList.toggle('hidden', s.id!== 'sec-'+id));
  document.getElementById('pub-nav').classList.remove('open');
  window.scrollTo({top:0, behavior:'smooth'});
  if(id==='reservas') renderCalendarPublic();
  if(id==='galeria') renderGalleryPublic();
  if(id==='resenas') renderReviewsPublic();
  if(id==='servicios') renderServicesPublic();
  if(id==='faq') renderFAQ();
  if(id==='contacto') renderContact();
}

function renderPublicNav(){
  document.getElementById('pub-nav').innerHTML = PUB_SECTIONS.map(s=>
    `<button data-id="${s.id}" class="${s.id===currentPub?'active':''}" onclick="goPublic('${s.id}')">${s.label}</button>`
  ).join('');
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
          <div class="eyebrow" style="color:var(--amber)">San Miguel de Tucumán</div>
          <h1>Aprendé a manejar con <em>paciencia y seguridad</em>, practicando con tu propio auto.</h1>
          <p class="sub">Clases personalizadas a tu ritmo, para perder el miedo al volante o sacar tu primera licencia. Las clases se dictan siempre en el auto de la alumna: aprendés desde el primer día con el vehículo que después vas a usar todos los días.</p>
          <div class="ctas">
            <button class="cta-btn" onclick="goPublic('reservas')">Reservar ahora</button>
            <button class="cta-btn ghost" onclick="goPublic('servicios')">Ver precios</button>
          </div>
          <div class="badge-row">
            <div class="badge">${icon('heart')} Paciencia, a tu ritmo</div>
            <div class="badge">${icon('shield')} Clases seguras</div>
            <div class="badge">${icon('wheel')} Se enseña con tu propio auto</div>
          </div>
        </div>
        <div class="wheel">${wheelSVG()}</div>
      </div>
    </div>
  </section>`;
}
function icon(name){
  const paths = {
    heart:'M12 20s-7-4.4-9.3-8.8C1.2 8 2.6 5 5.7 5c1.8 0 3.1 1 4.3 2.4C11.2 6 12.5 5 14.3 5c3.1 0 4.5 3 3 6.2C19.3 15.6 12 20 12 20z',
    shield:'M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z',
    wheel:'M12 3v3M12 18v3M3 12h3M18 12h3M12 12l4.2-4.2M12 12L7.8 16.2M12 12l4.2 4.2M12 12L7.8 7.8'
  };
  const circle = name==='wheel' ? '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.4"/>' : '';
  return `<svg class="icon" viewBox="0 0 24 24">${circle}<path d="${paths[name]}"/></svg>`;
}
function wheelSVG(){
  return `<svg viewBox="0 0 300 300" width="100%">
    <circle cx="150" cy="150" r="120" fill="none" stroke="#3A4C61" stroke-width="18"/>
    <circle cx="150" cy="150" r="120" fill="none" stroke="#E8A33D" stroke-width="4" stroke-dasharray="6 14"/>
    <circle cx="150" cy="150" r="34" fill="#E8A33D"/>
    <path d="M150 150 L150 60 M150 150 L72 195 M150 150 L228 195" stroke="#3A4C61" stroke-width="14" stroke-linecap="round"/>
    <circle cx="150" cy="150" r="14" fill="#1E2A38"/>
  </svg>`;
}

/* ==================================================================
   RENDER: SERVICIOS Y PROMOS
   ================================================================== */
function renderServicesPublic(){
  const s = DB.services;
  const activePromos = DB.promos.filter(p=>p.active);
  document.getElementById('services-cards').innerHTML = `
    <div class="grid3">
      <div class="card">
        <h3>Clase suelta</h3>
        <p>${s.suelta.desc}</p>
        <div class="price">${fmtMoney(s.suelta.price)} <small>/ clase</small></div>
        <button class="cta-btn small" onclick="goPublic('reservas')">Reservar clase</button>
      </div>
      ${s.packs.map(p=>`
      <div class="card">
        <span class="pack-tag">${p.classes} clases</span>
        <h3>${p.name}</h3>
        <p>Ideal si querés practicar seguido y afianzar la confianza al volante.</p>
        <div class="price">${fmtMoney(p.price)}</div>
        <button class="cta-btn small" onclick="goPublic('reservas')">Reservar clase</button>
      </div>`).join('')}
    </div>
    <div class="grid3" style="margin-top:20px;">
      <div class="card" style="grid-column:1/-1;">
        <span class="pack-tag" style="background:var(--brick-dim);color:var(--brick)">Curso integral</span>
        <h3>Mi Primera Licencia</h3>
        <p>${s.curso.desc}</p>
        <div class="price">${fmtMoney(s.curso.price)}</div>
        <button class="cta-btn small" onclick="goPublic('reservas')">Reservar clase</button>
      </div>
    </div>
  `;
  document.getElementById('promos-strip').innerHTML = activePromos.length ? `
    <h3 style="margin-bottom:14px;">Promos activas</h3>
    ${activePromos.map(p=>`
      <div class="promo-card">
        <div><h4>${escapeHTML(p.title)}</h4><p>${escapeHTML(p.desc)}</p></div>
        ${p.badge? `<span class="promo-badge">${escapeHTML(p.badge)}</span>`:''}
      </div>`).join('')}
  ` : '';
}

/* ==================================================================
   RENDER: CALENDARIO PÚBLICO + RESERVA
   ================================================================== */
let pubMonthOffset = 0;
let pubSelectedDate = null;
let pubSelectedTime = null;

function monthGridDates(offset){
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth()+offset, 1);
  const year = base.getFullYear(), month = base.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const cells = [];
  for(let i=0;i<firstDow;i++) cells.push(null);
  for(let d=1; d<=daysInMonth; d++) cells.push(new Date(year, month, d));
  return { cells, year, month };
}

function slotsLeft(iso, excludeBookingId){
  const all = DB.schedule.availability[iso] || [];
  const taken = DB.bookings.filter(b=> b.date===iso && b.status!=='cancelled' && b.id!==excludeBookingId).map(b=>b.time);
  return all.filter(t=> !taken.includes(t));
}

function renderCalendarPublic(){
  buildCalendar('cal-public', pubMonthOffset, {
    onNav:(delta)=>{ pubMonthOffset += delta; renderCalendarPublic(); },
    onPick:(iso)=>{ pubSelectedDate = iso; pubSelectedTime = null; renderSlotPanel(); renderCalendarPublic(); },
    selected: pubSelectedDate,
    mode:'public'
  });
  renderSlotPanel();
}

function buildCalendar(containerId, offset, opts){
  const { cells, year, month } = monthGridDates(offset);
  const todayIso = todayISO();
  const html = `
    <div class="cal-head">
      <button onclick="(${opts.onNav.toString()})(-1)">‹</button>
      <div class="m-title">${MONTHS[month]} ${year}</div>
      <button onclick="(${opts.onNav.toString()})(1)">›</button>
    </div>
    <div class="cal-grid">
      ${DOW.map(d=>`<div class="cal-dow">${d}</div>`).join('')}
      ${cells.map(d=>{
        if(!d) return `<div class="cal-day pad"></div>`;
        const iso = toISO(d);
        const isPast = iso < todayIso;
        const blocked = !!DB.schedule.blocked[iso];
        const hasAvail = !!DB.schedule.availability[iso];
        const free = hasAvail ? slotsLeft(iso).length : 0;
        let cls = 'cal-day';
        if(isPast) cls += ' past';
        else if(blocked) cls += ' blocked';
        else if(hasAvail && free>0) cls += ' avail';
        else if(hasAvail && free===0) cls += ' full';
        if(iso===opts.selected) cls += ' selected';
        const clickable = opts.mode==='admin' ? !isPast : (!isPast && !blocked && hasAvail);
        return `<button class="${cls}" ${clickable? `onclick="(${opts.onPick.toString()})('${iso}')"`:'disabled'}>${d.getDate()}${(hasAvail&&!isPast)?'<span class="dot"></span>':''}</button>`;
      }).join('')}
    </div>
    <div class="legend">
      <span><i style="background:var(--sage-dim);border:1px solid var(--sage)"></i>Con turnos libres</span>
      <span><i style="background:var(--brick-dim);border:1px solid var(--brick)"></i>Completo</span>
      <span><i style="background:var(--cream-dim)"></i>Sin atención</span>
    </div>
  `;
  document.getElementById(containerId).innerHTML = html;
}

function renderSlotPanel(){
  const panel = document.getElementById('slot-panel');
  if(!panel) return;
  if(!pubSelectedDate){
    panel.innerHTML = `<h3>Elegí un día</h3><p class="lede" style="margin:0;">Tocá una fecha con turnos libres en el calendario para ver los horarios disponibles.</p>`;
    return;
  }
  const free = slotsLeft(pubSelectedDate);
  panel.innerHTML = `
    <h3>${fmtDateHuman(pubSelectedDate)}</h3>
    ${free.length? `<p style="color:var(--ink-soft);font-size:14px;">Elegí un horario:</p>
    <div class="slot-list">
      ${(DB.schedule.availability[pubSelectedDate]||[]).map(t=>{
        const isFree = free.includes(t);
        return `<button class="slot-btn ${pubSelectedTime===t?'picked':''}" ${isFree?`onclick="pickTime('${t}')"`:'disabled'}>${t}</button>`;
      }).join('')}
    </div>` : `<p class="note">No quedan horarios libres este día. Probá otra fecha.</p>`}
    ${pubSelectedTime? bookingFormHTML() : ''}
  `;
}
function pickTime(t){ pubSelectedTime = t; renderSlotPanel(); }

function bookingFormHTML(){
  const s = DB.services;
  return `
    <form onsubmit="return submitBooking(event)" style="margin-top:18px;border-top:1px solid var(--line);padding-top:18px;">
      <div class="field"><label>Nombre y apellido</label><input required id="bk-name"></div>
      <div class="field">
  <label>Código de área</label>

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
  <label>Número de WhatsApp</label>

  <input
    required
    id="bk-phone-number"
    type="tel"
    inputmode="numeric"
    maxlength="8"
    placeholder="Número sin 15"
  >

  <p class="note">
    Escribí solamente el número, sin 15 y sin +54 9.
  </p>
</div>
      <div class="field">
        <label>Servicio</label>
        <select id="bk-service">
          <option value="suelta">Clase suelta — ${fmtMoney(s.suelta.price)}</option>
          ${s.packs.map(p=>`<option value="${p.id}">${p.name} — ${fmtMoney(p.price)}</option>`).join('')}
          <option value="curso">Curso integral - Mi Primera Licencia — ${fmtMoney(s.curso.price)}</option>
        </select>
      </div>
      <button class="cta-btn" type="submit" style="width:100%;">Solicitar turno — ${fmtDateHuman(pubSelectedDate)} a las ${pubSelectedTime}</button>
      <div id="bk-msg"></div>
    </form>`;
}

async function submitBooking(ev){
  ev.preventDefault();

  const name = document
    .getElementById('bk-name')
    .value
    .trim();

  const areaCode = document
    .getElementById('bk-area-code')
    .value
    .replace(/\D/g, '');

  const phoneNumber = document
    .getElementById('bk-phone-number')
    .value
    .replace(/\D/g, '');

  const service = document
    .getElementById('bk-service')
    .value;

  /*
    El código de área y el número deben sumar
    10 dígitos.

    Ejemplos:
    381 + 1234567
    3865 + 123456
  */
  const nationalNumber = areaCode + phoneNumber;

  if(
    areaCode.length < 2 ||
    areaCode.length > 4 ||
    nationalNumber.length !== 10
  ){
    document.getElementById('bk-msg').innerHTML = `
      <div class="error-box">
        Revisá el teléfono ingresado. El código de área y
        el número deben sumar 10 dígitos.
        <br><br>
        Ejemplos:
        <br>381 + 1234567
        <br>3865 + 123456
      </div>
    `;

    return false;
  }

  const phone = '549' + nationalNumber;

  if(!slotsLeft(pubSelectedDate).includes(pubSelectedTime)){
    document.getElementById('bk-msg').innerHTML = `
      <div class="error-box">
        Uy, ese horario acaba de ocuparse.
        Elegí otro.
      </div>
    `;

    renderSlotPanel();
    return false;
  }

  DB.bookings.push({
    id: uid('bk'),
    date: pubSelectedDate,
    time: pubSelectedTime,
    name,
    phone,
    service,
    status: 'pending'
  });

  const saved = await saveDB();

  if(!saved){
    document.getElementById('bk-msg').innerHTML = `
      <div class="error-box">
        No se pudo guardar la reserva.
        Intentá nuevamente.
      </div>
    `;

    return false;
  }

  const chosenTime = pubSelectedTime;
  const chosenDate = pubSelectedDate;

  pubSelectedTime = null;

  renderCalendarPublic();

  document.getElementById('slot-panel').innerHTML += `
    <div class="success-box">
      ¡Listo, ${escapeHTML(name)}!
      Solicitaste el turno del
      ${fmtDateHuman(chosenDate)}
      a las ${chosenTime}.
      Te confirmamos por WhatsApp a la brevedad.
    </div>
  `;

  return false;
}

/* ==================================================================
   RENDER: GALERÍA DE EGRESADAS
   ================================================================== */
function renderGalleryPublic(){
  const photos = (DB.gallery||[]).slice().reverse();
  document.getElementById('gallery-grid').innerHTML = photos.length ? photos.map(g=>`
    <div class="gphoto">
      <img src="${g.image}" alt="${escapeHTML(g.name||'Alumna que finalizó el curso')}">
      <div class="gcap">
        <div class="gname">${escapeHTML(g.name||'Alumna')}</div>
        ${g.desc? `<div class="gdesc">${escapeHTML(g.desc)}</div>` : ''}
      </div>
    </div>
  `).join('') : `<div class="empty">Todavía no hay fotos cargadas. ¡Pronto vamos a compartir a las alumnas que terminen el curso!</div>`;
}

/* ==================================================================
   RENDER: RESEÑAS
   ================================================================== */
function renderReviewsPublic(){
  const approved = DB.reviews.filter(r=>r.status==='approved');
  document.getElementById('reviews-track').innerHTML = approved.length ? approved.map(r=>`
    <div class="review-card">
      <div class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
      <p style="margin:0;font-size:14.5px;color:var(--ink);">${escapeHTML(r.comment)}</p>
      <div class="who">— ${escapeHTML(r.name)}</div>
      ${r.reply? `<div class="reply-box"><b>Respuesta de la profe:</b> ${escapeHTML(r.reply)}</div>`:''}
    </div>
  `).join('') : `<div class="empty">Todavía no hay reseñas publicadas. ¡Sé la primera en dejar tu opinión!</div>`;
}
async function submitReview(ev){
  ev.preventDefault();
  const name = document.getElementById('rv-name').value.trim();
  const rating = Number(document.getElementById('rv-rating').value);
  const comment = document.getElementById('rv-comment').value.trim();
  DB.reviews.push({ id:uid('rv'), name, rating, comment, status:'pending', reply:'' });
  await saveDB();
  document.getElementById('review-form-msg').innerHTML = `<div class="success-box">¡Gracias por tu opinión! Se publicará apenas sea revisada.</div>`;
  ev.target.reset();
  return false;
}

/* ==================================================================
   RENDER: FAQ
   ================================================================== */
function renderFAQ(){
  const st = DB.settings;
  const items = [
    { q:'¿En qué zonas trabajan?', a: st.zonas },
    { q:'¿Necesito auto propio para las clases?', a: st.autoPropio },
    { q:'¿Qué necesito para empezar?', a: st.requisitos },
    { q:'¿Cuál es la política de cancelación?', a: st.cancelacion }
  ];
  document.getElementById('faq-list').innerHTML = items.map((it,i)=>`
    <div class="faq-item" id="faq-${i}">
      <button class="faq-q" onclick="toggleFaq(${i})"><span>${escapeHTML(it.q)}</span><span class="chev">+</span></button>
      <div class="faq-a"><inner>${escapeHTML(it.a)}</inner></div>
    </div>
  `).join('');
}
function toggleFaq(i){
  const el = document.getElementById('faq-'+i);
  const wasOpen = el.classList.contains('open');
  document.querySelectorAll('.faq-item').forEach(f=>f.classList.remove('open'));
  if(!wasOpen) el.classList.add('open');
}

/* ==================================================================
   RENDER: CONTACTO
   ================================================================== */
function renderContact(){
  const st = DB.settings;
  const hasWa = !!st.whatsapp;
  document.getElementById('contact-links').innerHTML = `
    ${hasWa ? `<a href="${waLink(st.whatsapp, 'Hola! Quiero consultar por clases de manejo.')}" target="_blank">${icon('shield')} WhatsApp: escribinos directo</a>` : ''}
    ${st.instagram ? `<a href="https://instagram.com/${st.instagram}" target="_blank">${icon('heart')} Instagram @${st.instagram}</a>` : ''}
  `;
  const waBtn = document.getElementById('wa-float-btn');
  if(hasWa){ waBtn.classList.remove('hidden'); waBtn.href = waLink(st.whatsapp,'Hola! Quiero consultar por clases de manejo.'); }
  else { waBtn.classList.add('hidden'); }
}
async function submitContact(ev){
  ev.preventDefault();
  const name = document.getElementById('ct-name').value.trim();
  const contact = document.getElementById('ct-contact').value.trim();
  const message = document.getElementById('ct-message').value.trim();
  DB.messages.push({ id:uid('msg'), name, contact, message, date:new Date().toISOString(), read:false });
  await saveDB();
  document.getElementById('contact-form-msg').innerHTML = `<div class="success-box">¡Mensaje enviado! Te respondemos a la brevedad.</div>`;
  ev.target.reset();
  return false;
}

/* ==================================================================
   ARMADO DE SECCIONES PÚBLICAS (una sola vez)
   ================================================================== */
function buildPublicSections(){
  document.getElementById('pub-sections').innerHTML = `
    ${renderHero()}

    <section id="sec-servicios" class="hidden">
      <div class="wrap">
        <div class="eyebrow">Servicios y precios</div>
        <h2 class="title">Elegí cómo querés aprender</h2>
        <p class="lede">Clases sueltas para perfeccionarte, packs para practicar seguido, o el curso completo para sacar tu primera licencia.</p>
        <div id="services-cards"></div>
        <div class="promos-strip" id="promos-strip"></div>
      </div>
    </section>

    <section id="sec-reservas" class="hidden" style="background:var(--cream-dim);">
      <div class="wrap">
        <div class="eyebrow">Reservas</div>
        <h2 class="title">Elegí tu turno</h2>
        <p class="lede">Mirá los días y horarios libres y solicitá tu clase. Te confirmamos por WhatsApp.</p>
        <div class="booking-grid">
          <div class="cal" id="cal-public"></div>
          <div class="slot-panel" id="slot-panel"></div>
        </div>
      </div>
    </section>

    <section id="sec-galeria" class="hidden">
      <div class="wrap">
        <div class="eyebrow">Egresadas</div>
        <h2 class="title">Alumnas que ya se sacaron su licencia</h2>
        <p class="lede">Un poco de orgullo compartido: alumnas que terminaron el curso y ya manejan solas.</p>
        <div class="gallery-grid" id="gallery-grid"></div>
      </div>
    </section>

    <section id="sec-resenas" class="hidden">
      <div class="wrap">
        <div class="eyebrow">Reseñas</div>
        <h2 class="title">Lo que dicen las alumnas</h2>
        <div class="reviews-track" id="reviews-track"></div>
        <div class="panel" style="margin-top:30px;max-width:520px;">
          <h3>Dejá tu opinión</h3>
          <form onsubmit="return submitReview(event)">
            <div class="field"><label>Tu nombre</label><input required id="rv-name"></div>
            <div class="field"><label>Puntaje</label>
              <select id="rv-rating"><option value="5">★★★★★ Excelente</option><option value="4">★★★★☆ Muy bueno</option><option value="3">★★★☆☆ Bueno</option><option value="2">★★☆☆☆ Regular</option><option value="1">★☆☆☆☆ Malo</option></select>
            </div>
            <div class="field"><label>Comentario</label><textarea required id="rv-comment" rows="3"></textarea></div>
            <button class="cta-btn" type="submit">Enviar opinión</button>
            <div id="review-form-msg"></div>
          </form>
        </div>
      </div>
    </section>

    <section id="sec-faq" class="hidden" style="background:var(--cream-dim);">
      <div class="wrap" style="max-width:760px;">
        <div class="eyebrow">Información útil</div>
        <h2 class="title">Preguntas frecuentes</h2>
        <div id="faq-list"></div>
      </div>
    </section>

    <section id="sec-contacto" class="hidden">
      <div class="wrap">
        <div class="eyebrow">Contacto</div>
        <h2 class="title">Hablemos</h2>
        <div class="contact-grid">
          <div class="contact-links" id="contact-links"></div>
          <div class="panel">
            <h3>Formulario de consultas</h3>
            <form onsubmit="return submitContact(event)">
              <div class="field"><label>Nombre</label><input required id="ct-name"></div>
              <div class="field"><label>Teléfono o Instagram</label><input required id="ct-contact"></div>
              <div class="field"><label>Consulta</label><textarea required id="ct-message" rows="4"></textarea></div>
              <button class="cta-btn" type="submit">Enviar consulta</button>
              <div id="contact-form-msg"></div>
            </form>
          </div>
        </div>
      </div>
    </section>
  `;
}

function escapeHTML(s){
  return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ==================================================================
   ADMIN — AUTENTICACIÓN
   ================================================================== */
const ADMIN_PASS = 'manejo2026';
let adminAuthed = false;

function openAdmin(){
  document.getElementById('public-view').classList.add('hidden');
  document.getElementById('admin-view').classList.remove('hidden');
  if(adminAuthed){ showAdminDashboard(); } else { showAdminLogin(); }
}
function closeAdmin(){
  document.getElementById('admin-view').classList.add('hidden');
  document.getElementById('public-view').classList.remove('hidden');
}
function showAdminLogin(){
  document.getElementById('admin-login-screen').classList.remove('hidden');
  document.getElementById('admin-dashboard-screen').classList.add('hidden');
}
function handleLogin(ev){
  ev.preventDefault();
  const pass = document.getElementById('login-pass').value;
  if(pass === ADMIN_PASS){
    adminAuthed = true;
    document.getElementById('login-error').classList.add('hidden');
    showAdminDashboard();
  } else {
    document.getElementById('login-error').classList.remove('hidden');
  }
  return false;
}
function logoutAdmin(){ adminAuthed = false; closeAdmin(); }
function showAdminDashboard(){
  document.getElementById('admin-login-screen').classList.add('hidden');
  document.getElementById('admin-dashboard-screen').classList.remove('hidden');
  renderAdminNav();
  goAdmin('dashboard');
}

/* ==================================================================
   ADMIN — NAVEGACIÓN
   ================================================================== */
const ADMIN_TABS = [
  { id:'dashboard', label:'Panel de control' },
  { id:'agenda', label:'Agenda' },
  { id:'alumnas', label:'Fichas de alumnas' },
  { id:'galeria', label:'Galería de egresadas' },
  { id:'resenas', label:'Reseñas' },
  { id:'precios', label:'Precios y promos' },
  { id:'mensajes', label:'Mensajes' },
  { id:'ajustes', label:'Ajustes del sitio' }
];
let currentAdminTab = 'dashboard';
function renderAdminNav(){
  document.getElementById('admin-nav').innerHTML = ADMIN_TABS.map(t=>
    `<button class="${t.id===currentAdminTab?'active':''}" onclick="goAdmin('${t.id}')">${t.label}</button>`
  ).join('');
}
function goAdmin(id){
  currentAdminTab = id;
  renderAdminNav();
  const fns = { dashboard:renderAdminDashboard, agenda:renderAdminAgenda, alumnas:renderAdminStudents, galeria:renderAdminGallery, resenas:renderAdminReviews, precios:renderAdminPricing, mensajes:renderAdminMessages, ajustes:renderAdminSettings };
  fns[id]();
}

/* ---------- DASHBOARD ---------- */
function renderAdminDashboard(){
  const today = todayISO();
  const in7 = new Date(); in7.setDate(in7.getDate()+7);
  const in7iso = toISO(in7);
  const confirmed = DB.bookings.filter(b=>b.status==='confirmed');
  const classesToday = confirmed.filter(b=>b.date===today).length;
  const classesWeek = confirmed.filter(b=>b.date>=today && b.date<=in7iso).length;
  const pending = DB.bookings.filter(b=>b.status==='pending').length;
  const thisMonth = today.slice(0,7);
  const income = confirmed.filter(b=>b.date.slice(0,7)===thisMonth).reduce((sum,b)=> sum + priceFor(b.service), 0);
  const pendingReviews = DB.reviews.filter(r=>r.status==='pending').length;

  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  const tIso = toISO(tomorrow);
  const remindersList = confirmed.filter(b=>b.date===tIso);

  document.getElementById('admin-main').innerHTML = `
    <h2>Panel de control</h2>
    <p class="lede" style="margin-bottom:22px;">Un vistazo rápido a cómo viene el negocio.</p>
    ${!DB.settings.whatsapp ? `<div class="demo-note">Todavía no cargaste tu número de WhatsApp real. Andá a <b>Ajustes del sitio</b> para cargarlo y activar el botón de contacto rápido y los recordatorios.</div>` : ''}
    <div class="stat-grid">
      <div class="stat-card"><div class="num">${classesToday}</div><div class="lbl">Clases hoy</div></div>
      <div class="stat-card"><div class="num">${classesWeek}</div><div class="lbl">Clases esta semana</div></div>
      <div class="stat-card"><div class="num">${pending}</div><div class="lbl">Solicitudes pendientes</div></div>
      <div class="stat-card"><div class="num">${fmtMoney(income)}</div><div class="lbl">Ingresos estimados del mes</div></div>
    </div>
    <div class="panel">
      <h3>Recordatorios automáticos — clases de mañana (${fmtDateHuman(tIso)})</h3>
      ${remindersList.length ? `
      <div class="table-scroll"><table class="admin-table">
        <tr><th>Alumna</th><th>Hora</th><th>Servicio</th><th></th></tr>
        ${remindersList.map(b=>`
        <tr>
          <td>${escapeHTML(b.name)}</td>
          <td class="mono">${b.time}</td>
          <td>${labelFor(b.service)}</td>
          <td><a class="mini-btn wa" target="_blank" href="${waLink(b.phone, 'Hola '+b.name+'! Te recordamos tu clase de manejo mañana '+fmtDateHuman(b.date)+' a las '+b.time+'. ¡Te esperamos!')}">Enviar recordatorio por WhatsApp</a></td>
        </tr>`).join('')}
      </table></div>` : `<div class="empty">No hay clases confirmadas para mañana.</div>`}
      <p class="note">Este recordatorio se envía manualmente con un clic (abre WhatsApp con el mensaje ya escrito). Para que se envíe 100% automático por email o WhatsApp sin intervención, hace falta conectar un servicio externo (por ejemplo WhatsApp Business API o un envío de emails programado) del lado del servidor.</p>
    </div>
    <div class="panel">
      <h3>Otros pendientes</h3>
      <p style="margin:0;">📝 ${pendingReviews} reseña${pendingReviews===1?'':'s'} esperando moderación · 💬 ${DB.messages.filter(m=>!m.read).length} mensaje${DB.messages.filter(m=>!m.read).length===1?'':'s'} nuevo${DB.messages.filter(m=>!m.read).length===1?'':'s'} de contacto</p>
    </div>
  `;
}
function priceFor(serviceKey){
  if(serviceKey==='suelta') return DB.services.suelta.price;
  if(serviceKey==='curso') return DB.services.curso.price;
  const pack = DB.services.packs.find(p=>p.id===serviceKey);
  return pack ? pack.price : 0;
}
function labelFor(serviceKey){
  if(serviceKey==='suelta') return SERVICE_LABELS.suelta;
  if(serviceKey==='curso') return SERVICE_LABELS.curso;
  const pack = DB.services.packs.find(p=>p.id===serviceKey);
  return pack ? pack.name : serviceKey;
}

/* ---------- AGENDA ---------- */
let adminMonthOffset = 0;
let adminSelectedDate = null;
function renderAdminAgenda(){
  document.getElementById('admin-main').innerHTML = `
    <h2>Gestión de agenda</h2>
    <p class="lede" style="margin-bottom:22px;">Creá turnos, bloqueá días y confirmá o cancelá solicitudes.</p>
    <div class="booking-grid">
      <div class="cal" id="cal-admin"></div>
      <div class="slot-panel" id="admin-day-panel"></div>
    </div>
  `;
  drawAdminCalendar();
}
function drawAdminCalendar(){
  buildCalendar('cal-admin', adminMonthOffset, {
    onNav:(delta)=>{ adminMonthOffset += delta; drawAdminCalendar(); },
    onPick:(iso)=>{ adminSelectedDate = iso; renderAdminDayPanel(); drawAdminCalendar(); },
    selected: adminSelectedDate,
    mode:'admin'
  });
  renderAdminDayPanel();
}
function renderAdminDayPanel(){
  const panel = document.getElementById('admin-day-panel');
  if(!adminSelectedDate){ panel.innerHTML = `<h3>Elegí un día</h3><p class="note">Tocá una fecha en el calendario para administrarla.</p>`; return; }
  const iso = adminSelectedDate;
  const blocked = !!DB.schedule.blocked[iso];
  const slots = DB.schedule.availability[iso] || [];
  const bookingsDay = DB.bookings.filter(b=>b.date===iso && b.status!=='cancelled');
  panel.innerHTML = `
    <h3>${fmtDateHuman(iso)}</h3>
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:14px;font-size:14px;">
      <input type="checkbox" ${blocked?'checked':''} onchange="toggleBlockDay('${iso}', this.checked)"> No atiendo este día (bloquear)
    </label>
    ${!blocked ? `
    <p style="font-size:13px;color:var(--ink-soft);margin-bottom:6px;">Horarios disponibles:</p>
    <div class="slot-list">
      ${slots.map(t=>{
        const isBooked = bookingsDay.some(b=>b.time===t);
        return `<span class="slot-btn ${isBooked?'picked':''}" style="display:inline-flex;align-items:center;gap:6px;">${t}${!isBooked?`<button class="tag-del" onclick="removeSlot('${iso}','${t}')" title="Quitar">✕</button>`:''}</span>`;
      }).join('') || '<span class="note">Sin horarios cargados.</span>'}
    </div>
    <div class="inline-form" style="margin-bottom:20px;">
      <div class="f"><label>Agregar horario</label><input type="time" id="new-slot-time"></div>
      <button class="mini-btn" onclick="addSlot('${iso}')">Agregar</button>
    </div>` : ''}
    <h3 style="font-size:16px;">Solicitudes y clases este día</h3>
    ${bookingsDay.length ? `
    <div class="table-scroll"><table class="admin-table">
      <tr><th>Hora</th><th>Alumna</th><th>Servicio</th><th>Estado</th><th></th></tr>
      ${bookingsDay.map(b=>`
      <tr>
        <td class="mono">${b.time}</td>
        <td>${escapeHTML(b.name)}<br><span class="note">${escapeHTML(b.phone)}</span></td>
        <td>${labelFor(b.service)}</td>
        <td><span class="pill ${b.status}">${b.status==='pending'?'Pendiente':b.status==='confirmed'?'Confirmada':'Cancelada'}</span></td>
        <td class="btnrow">
          ${b.status==='pending'?`<button class="mini-btn ok" onclick="setBookingStatus('${b.id}','confirmed')">Confirmar</button>`:''}
          ${b.status!=='cancelled'?`<button class="mini-btn no" onclick="setBookingStatus('${b.id}','cancelled')">Cancelar</button>`:''}
          <a class="mini-btn wa" target="_blank" href="${waLink(b.phone,'Hola '+b.name+'! Te escribimos por tu clase de manejo del '+fmtDateHuman(b.date)+' a las '+b.time+'.')}">WhatsApp</a>
        </td>
      </tr>`).join('')}
    </table></div>` : `<div class="empty">No hay turnos solicitados para este día.</div>`}
  `;
}
async function toggleBlockDay(iso, val){
  if(val) DB.schedule.blocked[iso] = true; else delete DB.schedule.blocked[iso];
  await saveDB(); drawAdminCalendar();
}
async function addSlot(iso){
  const t = document.getElementById('new-slot-time').value;
  if(!t) return;
  if(!DB.schedule.availability[iso]) DB.schedule.availability[iso] = [];
  if(!DB.schedule.availability[iso].includes(t)){
    DB.schedule.availability[iso].push(t);
    DB.schedule.availability[iso].sort();
  }
  await saveDB(); drawAdminCalendar();
}
async function removeSlot(iso, t){
  DB.schedule.availability[iso] = (DB.schedule.availability[iso]||[]).filter(x=>x!==t);
  await saveDB(); drawAdminCalendar();
}
async function setBookingStatus(id, status){
  const b = DB.bookings.find(x=>x.id===id);
  if(b) b.status = status;
  await saveDB(); renderAdminDayPanel(); drawAdminCalendar();
}

/* ---------- ALUMNAS ---------- */
function renderAdminStudents(){
  document.getElementById('admin-main').innerHTML = `
    <h2>Fichas de alumnas</h2>
    <p class="lede" style="margin-bottom:22px;">Datos de contacto, clases tomadas y progreso de cada alumna.</p>
    <div class="panel">
      <h3>Agregar alumna</h3>
      <div class="inline-form">
        <div class="f"><label>Nombre</label><input id="st-name"></div>
        <div class="f"><label>Teléfono</label><input id="st-phone"></div>
        <div class="f"><label>Clases tomadas</label><input id="st-classes" type="number" min="0" value="0" style="width:90px;"></div>
        <div class="f"><label>Progreso</label><input id="st-progress" placeholder="Ej: recién empieza"></div>
        <button class="mini-btn" onclick="addStudent()">Agregar</button>
      </div>
    </div>
    <div class="table-scroll"><table class="admin-table">
      <tr><th>Nombre</th><th>Teléfono</th><th>Clases tomadas</th><th>Progreso</th><th></th></tr>
      ${DB.students.map(s=>`
      <tr>
        <td>${escapeHTML(s.name)}</td>
        <td>${escapeHTML(s.phone)}</td>
        <td class="mono">${s.classesTaken}</td>
        <td style="max-width:260px;">${escapeHTML(s.progress)}</td>
        <td class="btnrow">
          <button class="mini-btn ok" onclick="bumpClasses('${s.id}')">+1 clase</button>
          <button class="mini-btn no" onclick="removeStudent('${s.id}')">Eliminar</button>
        </td>
      </tr>`).join('') || `<tr><td colspan="5"><div class="empty">Todavía no cargaste alumnas.</div></td></tr>`}
    </table></div>
  `;
}
async function addStudent(){
  const name = document.getElementById('st-name').value.trim();
  if(!name) return;
  DB.students.push({ id:uid('st'), name, phone:document.getElementById('st-phone').value.trim(), classesTaken:Number(document.getElementById('st-classes').value)||0, progress:document.getElementById('st-progress').value.trim() });
  await saveDB(); renderAdminStudents();
}
async function bumpClasses(id){
  const s = DB.students.find(x=>x.id===id); if(s) s.classesTaken++;
  await saveDB(); renderAdminStudents();
}
async function removeStudent(id){
  DB.students = DB.students.filter(x=>x.id!==id);
  await saveDB(); renderAdminStudents();
}

/* ---------- GALERÍA DE EGRESADAS (admin) ---------- */
function renderAdminGallery(){
  const photos = (DB.gallery||[]).slice().reverse();
  document.getElementById('admin-main').innerHTML = `
    <h2>Galería de egresadas</h2>
    <p class="lede" style="margin-bottom:22px;">Subí fotos de alumnas que ya terminaron el curso. La descripción es opcional. Se ven en la sección "Egresadas" del sitio público.</p>
    <div class="panel">
      <h3>Subir foto</h3>
      <form onsubmit="return addGalleryPhoto(event)">
        <div class="field"><label>Foto</label><input type="file" id="gal-file" accept="image/*" required></div>
        <div class="field"><label>Nombre de la alumna</label><input id="gal-name" placeholder="Ej: Sofía M."></div>
        <div class="field"><label>Descripción (opcional)</label><input id="gal-desc" placeholder="Ej: ¡Ya se sacó su primera licencia!"></div>
        <button class="cta-btn" type="submit">Subir foto</button>
        <div id="gal-msg"></div>
      </form>
      <p class="note">Las fotos se comprimen automáticamente para que la página cargue rápido. Si en algún momento no te deja subir una nueva, probablemente sea porque ya guardaste muchas fotos y se llenó el espacio disponible; eliminá alguna antigua para liberar lugar.</p>
    </div>
    <div class="admin-gallery-grid">
      ${photos.map(g=>`
        <div class="admin-gphoto">
          <button class="del-photo" title="Eliminar" onclick="removeGalleryPhoto('${g.id}')">✕</button>
          <img src="${g.image}" alt="">
          <div class="gcap"><b>${escapeHTML(g.name||'Sin nombre')}</b>${g.desc? '<br>'+escapeHTML(g.desc):''}</div>
        </div>
      `).join('') || '<div class="empty" style="grid-column:1/-1;">Todavía no subiste ninguna foto.</div>'}
    </div>
  `;
}
function resizeImageFile(file, maxSize=900, quality=0.72){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = ()=> reject(new Error('No se pudo leer el archivo'));
    reader.onload = ()=>{
      const img = new Image();
      img.onerror = ()=> reject(new Error('No se pudo procesar la imagen'));
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w > h && w > maxSize){ h = Math.round(h * maxSize / w); w = maxSize; }
        else if(h > maxSize){ w = Math.round(w * maxSize / h); h = maxSize; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function addGalleryPhoto(ev){
  ev.preventDefault();
  const fileInput = document.getElementById('gal-file');
  const msg = document.getElementById('gal-msg');
  const file = fileInput.files[0];
  if(!file){ return false; }
  msg.innerHTML = `<p class="note">Procesando imagen…</p>`;
  try{
    const dataUrl = await resizeImageFile(file);
    const name = document.getElementById('gal-name').value.trim();
    const desc = document.getElementById('gal-desc').value.trim();
    const entry = { id:uid('gal'), name, desc, image:dataUrl, date:new Date().toISOString() };
    DB.gallery.push(entry);
    try{
      await saveDB();
    }catch(saveErr){
      DB.gallery = DB.gallery.filter(g=>g.id!==entry.id);
      throw saveErr;
    }
    renderAdminGallery();
  }catch(e){
    msg.innerHTML = `<div class="error-box">No se pudo subir la foto (puede ser un archivo muy pesado o falta de espacio disponible). Probá con otra imagen o eliminá alguna foto antigua.</div>`;
  }
  return false;
}
async function removeGalleryPhoto(id){
  DB.gallery = DB.gallery.filter(x=>x.id!==id);
  await saveDB(); renderAdminGallery();
}

/* ---------- RESEÑAS (admin) ---------- */
function renderAdminReviews(){
  document.getElementById('admin-main').innerHTML = `
    <h2>Moderación de reseñas</h2>
    <p class="lede" style="margin-bottom:22px;">Aprobá, rechazá o respondé las opiniones que dejan las clientas.</p>
    <div class="table-scroll"><table class="admin-table">
      <tr><th>Nombre</th><th>Puntaje</th><th>Comentario</th><th>Estado</th><th>Respuesta</th><th></th></tr>
      ${DB.reviews.map(r=>`
      <tr>
        <td>${escapeHTML(r.name)}</td>
        <td class="mono">${'★'.repeat(r.rating)}</td>
        <td style="max-width:260px;">${escapeHTML(r.comment)}</td>
        <td><span class="pill ${r.status==='approved'?'confirmed':r.status==='rejected'?'cancelled':'pending'}">${r.status==='approved'?'Aprobada':r.status==='rejected'?'Rechazada':'Pendiente'}</span></td>
        <td style="min-width:180px;">
          <textarea id="reply-${r.id}" rows="2" style="width:100%;font-size:13px;padding:6px;border:1px solid var(--line);border-radius:6px;">${escapeHTML(r.reply||'')}</textarea>
          <button class="mini-btn" style="margin-top:4px;" onclick="saveReply('${r.id}')">Guardar respuesta</button>
        </td>
        <td class="btnrow">
          <button class="mini-btn ok" onclick="setReviewStatus('${r.id}','approved')">Aprobar</button>
          <button class="mini-btn no" onclick="setReviewStatus('${r.id}','rejected')">Rechazar</button>
        </td>
      </tr>`).join('') || `<tr><td colspan="6"><div class="empty">No hay reseñas todavía.</div></td></tr>`}
    </table></div>
  `;
}
async function setReviewStatus(id, status){
  const r = DB.reviews.find(x=>x.id===id); if(r) r.status = status;
  await saveDB(); renderAdminReviews();
}
async function saveReply(id){
  const r = DB.reviews.find(x=>x.id===id);
  if(r) r.reply = document.getElementById('reply-'+id).value.trim();
  await saveDB(); renderAdminReviews();
}

/* ---------- PRECIOS Y PROMOS ---------- */
function renderAdminPricing(){
  const s = DB.services;
  document.getElementById('admin-main').innerHTML = `
    <h2>Precios y promociones</h2>
    <p class="lede" style="margin-bottom:22px;">Actualizá tus precios y activá o quitá promociones cuando quieras.</p>
    <div class="panel">
      <h3>Clase suelta</h3>
      <div class="inline-form">
        <div class="f"><label>Precio</label><input type="number" id="price-suelta" value="${s.suelta.price}" style="width:140px;"></div>
        <div class="f" style="flex:1;min-width:220px;"><label>Descripción</label><input id="desc-suelta" value="${escapeHTML(s.suelta.desc)}"></div>
        <button class="mini-btn" onclick="saveServiceSuelta()">Guardar</button>
      </div>
    </div>
    <div class="panel">
      <h3>Curso integral - Mi Primera Licencia</h3>
      <div class="inline-form">
        <div class="f"><label>Precio</label><input type="number" id="price-curso" value="${s.curso.price}" style="width:140px;"></div>
        <div class="f" style="flex:1;min-width:220px;"><label>Descripción</label><input id="desc-curso" value="${escapeHTML(s.curso.desc)}"></div>
        <button class="mini-btn" onclick="saveServiceCurso()">Guardar</button>
      </div>
    </div>
    <div class="panel">
      <h3>Packs de clases</h3>
      <div class="table-scroll"><table class="admin-table">
        <tr><th>Nombre</th><th>Cant. clases</th><th>Precio</th><th></th></tr>
        ${s.packs.map(p=>`
        <tr>
          <td><input id="pack-name-${p.id}" value="${escapeHTML(p.name)}" style="width:100%;"></td>
          <td><input type="number" id="pack-classes-${p.id}" value="${p.classes}" style="width:70px;"></td>
          <td><input type="number" id="pack-price-${p.id}" value="${p.price}" style="width:110px;"></td>
          <td class="btnrow"><button class="mini-btn" onclick="savePack('${p.id}')">Guardar</button><button class="mini-btn no" onclick="removePack('${p.id}')">Eliminar</button></td>
        </tr>`).join('')}
      </table></div>
      <div class="inline-form" style="margin-top:14px;">
        <div class="f"><label>Nombre</label><input id="new-pack-name" placeholder="Pack 8 clases"></div>
        <div class="f"><label>Cant. clases</label><input type="number" id="new-pack-classes" style="width:80px;"></div>
        <div class="f"><label>Precio</label><input type="number" id="new-pack-price" style="width:110px;"></div>
        <button class="mini-btn" onclick="addPack()">Agregar pack</button>
      </div>
    </div>
    <div class="panel">
      <h3>Promociones</h3>
      ${DB.promos.map(p=>`
      <div class="promo-card" style="background:${p.active? 'linear-gradient(135deg,var(--amber),var(--amber-dk))':'var(--cream-dim)'};color:${p.active?'var(--asphalt)':'var(--ink-soft)'}">
        <div><h4>${escapeHTML(p.title)}</h4><p>${escapeHTML(p.desc)}</p></div>
        <div class="btnrow">
          <button class="mini-btn" onclick="togglePromo('${p.id}')">${p.active?'Ocultar':'Activar'}</button>
          <button class="mini-btn no" onclick="removePromo('${p.id}')">Eliminar</button>
        </div>
      </div>`).join('') || '<div class="empty">No hay promociones cargadas.</div>'}
      <h4 style="margin-top:20px;">Nueva promo</h4>
      <div class="field"><label>Título</label><input id="new-promo-title"></div>
      <div class="field"><label>Descripción</label><input id="new-promo-desc"></div>
      <div class="field"><label>Etiqueta (opcional)</label><input id="new-promo-badge" placeholder="Ej: válido hasta fin de mes"></div>
      <button class="cta-btn small" onclick="addPromo()">Agregar promo</button>
    </div>
  `;
}
async function saveServiceSuelta(){
  DB.services.suelta.price = Number(document.getElementById('price-suelta').value)||0;
  DB.services.suelta.desc = document.getElementById('desc-suelta').value.trim();
  await saveDB(); renderAdminPricing();
}
async function saveServiceCurso(){
  DB.services.curso.price = Number(document.getElementById('price-curso').value)||0;
  DB.services.curso.desc = document.getElementById('desc-curso').value.trim();
  await saveDB(); renderAdminPricing();
}
async function savePack(id){
  const p = DB.services.packs.find(x=>x.id===id);
  p.name = document.getElementById('pack-name-'+id).value.trim();
  p.classes = Number(document.getElementById('pack-classes-'+id).value)||0;
  p.price = Number(document.getElementById('pack-price-'+id).value)||0;
  await saveDB(); renderAdminPricing();
}
async function removePack(id){
  DB.services.packs = DB.services.packs.filter(x=>x.id!==id);
  await saveDB(); renderAdminPricing();
}
async function addPack(){
  const name = document.getElementById('new-pack-name').value.trim();
  if(!name) return;
  DB.services.packs.push({ id:uid('pack'), name, classes:Number(document.getElementById('new-pack-classes').value)||0, price:Number(document.getElementById('new-pack-price').value)||0 });
  await saveDB(); renderAdminPricing();
}
async function togglePromo(id){
  const p = DB.promos.find(x=>x.id===id); p.active = !p.active;
  await saveDB(); renderAdminPricing();
}
async function removePromo(id){
  DB.promos = DB.promos.filter(x=>x.id!==id);
  await saveDB(); renderAdminPricing();
}
async function addPromo(){
  const title = document.getElementById('new-promo-title').value.trim();
  if(!title) return;
  DB.promos.push({ id:uid('promo'), title, desc:document.getElementById('new-promo-desc').value.trim(), badge:document.getElementById('new-promo-badge').value.trim(), active:true });
  await saveDB(); renderAdminPricing();
}

/* ---------- MENSAJES ---------- */
function renderAdminMessages(){
  document.getElementById('admin-main').innerHTML = `
    <h2>Mensajes de contacto</h2>
    <p class="lede" style="margin-bottom:22px;">Consultas enviadas desde el formulario de contacto del sitio.</p>
    <div class="table-scroll"><table class="admin-table">
      <tr><th>Fecha</th><th>Nombre</th><th>Contacto</th><th>Mensaje</th><th></th></tr>
      ${DB.messages.slice().reverse().map(m=>`
      <tr>
        <td class="mono">${new Date(m.date).toLocaleDateString('es-AR')}</td>
        <td>${escapeHTML(m.name)}</td>
        <td>${escapeHTML(m.contact)}</td>
        <td style="max-width:320px;">${escapeHTML(m.message)}</td>
        <td>${m.read? `<span class="pill confirmed">Leído</span>` : `<button class="mini-btn" onclick="markRead('${m.id}')">Marcar leído</button>`}</td>
      </tr>`).join('') || `<tr><td colspan="5"><div class="empty">No hay mensajes todavía.</div></td></tr>`}
    </table></div>
  `;
}
async function markRead(id){
  const m = DB.messages.find(x=>x.id===id); if(m) m.read = true;
  await saveDB(); renderAdminMessages();
}

/* ---------- AJUSTES ---------- */
function renderAdminSettings(){
  const st = DB.settings;
  document.getElementById('admin-main').innerHTML = `
    <h2>Ajustes del sitio</h2>
    <p class="lede" style="margin-bottom:22px;">Esta información alimenta las secciones de Contacto y Preguntas frecuentes del sitio público.</p>
    <div class="panel">
      <div class="field"><label>Número de WhatsApp (con código de país, sin espacios ni +)</label><input id="set-wa" value="${escapeHTML(st.whatsapp)}"></div>
      <div class="field"><label>Usuario de Instagram</label><input id="set-ig" value="${escapeHTML(st.instagram)}"></div>
      <div class="field"><label>Zonas de cobertura</label><textarea id="set-zonas" rows="3">${escapeHTML(st.zonas)}</textarea></div>
      <div class="field"><label>Respuesta sobre auto propio (obligatorio)</label><textarea id="set-autopropio" rows="3">${escapeHTML(st.autoPropio)}</textarea></div>
      <div class="field"><label>Requisitos para empezar</label><textarea id="set-requisitos" rows="3">${escapeHTML(st.requisitos)}</textarea></div>
      <div class="field"><label>Política de cancelación</label><textarea id="set-cancelacion" rows="3">${escapeHTML(st.cancelacion)}</textarea></div>
      <button class="cta-btn" onclick="saveSettings()">Guardar ajustes</button>
      <div id="settings-msg"></div>
    </div>
    <div class="demo-note">Este panel usa una contraseña simple para el prototipo. Antes de lanzarlo públicamente con clientas reales, conviene reforzar el acceso administrativo con una autenticación real de servidor.</div>
  `;
}
async function saveSettings(){
  DB.settings.whatsapp = document.getElementById('set-wa').value.trim();
  DB.settings.instagram = document.getElementById('set-ig').value.trim();
  DB.settings.zonas = document.getElementById('set-zonas').value.trim();
  DB.settings.autoPropio = document.getElementById('set-autopropio').value.trim();
  DB.settings.requisitos = document.getElementById('set-requisitos').value.trim();
  DB.settings.cancelacion = document.getElementById('set-cancelacion').value.trim();
  await saveDB();
  document.getElementById('settings-msg').innerHTML = `<div class="success-box">Ajustes guardados.</div>`;
}

/* ==================================================================
   INIT
   ================================================================== */
async function init(){
  await loadDB();
  renderPublicNav();
  buildPublicSections();
  goPublic('inicio');
}
init();