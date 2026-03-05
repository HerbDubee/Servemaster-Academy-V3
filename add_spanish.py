#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys

with open('app.html', 'r', encoding='utf-8') as f:
    c = f.read()

def rp(old, new):
    global c
    if old not in c:
        print(f"WARNING: pattern not found: {old[:80]!r}", file=sys.stderr)
    c = c.replace(old, new, 1)

# =============================================================
# 1. LANGUAGE TOGGLE BUTTON — add ES flag
# =============================================================
rp(
    "      <button onclick=\"setLang('fr')\" class=\"lang-btn\" id=\"lang-fr\" title=\"Français\">🇫🇷</button>",
    "      <button onclick=\"setLang('fr')\" class=\"lang-btn\" id=\"lang-fr\" title=\"Français\">🇫🇷</button>\n      <button onclick=\"setLang('es')\" class=\"lang-btn\" id=\"lang-es\" title=\"Español\">🇪🇸</button>"
)

# =============================================================
# 2. STRINGS object — add Spanish section
# =============================================================
rp(
    "    noStaff: \"Aucun membre du personnel n'a encore rejoint. Partagez le code d'invitation pour commencer.\",\n  }\n};",
    """    noStaff: "Aucun membre du personnel n'a encore rejoint. Partagez le code d'invitation pour commencer.",
  },
  es: {
    welcome: 'Bienvenido a ServeMaster', welcomeSub: 'La academia de formación profesional para meseros de excepción.',
    nameLbl: '¿Cuál es tu nombre?', continueBtn: 'Continuar →', expTitle: 'Tu nivel de experiencia',
    expSub: 'Adaptaremos tu camino de aprendizaje a donde estás ahora.',
    l1: '🌱 Nuevo en el Servicio', l1d: 'Estoy comenzando en la hostelería',
    l2: '⭐ Mesero Experimentado', l2d: 'He servido durante 1 a 3 años',
    l3: '🏆 Profesional Senior', l3d: 'Estoy perfeccionando mi oficio y apuntando a la excelencia',
    readySub: 'Tu plan de estudios personalizado está listo. 12 módulos, habilidades reales, resultados reales.',
    f1: '12 módulos de formación profesional', f2: '30 escenarios de juego de rol con IA',
    f3: 'Juego de rol vocal y simulación de bandeja', f4: 'Insignias, rachas y tabla de líderes',
    f5: 'Certificado de finalización en PDF', startBtn: 'Comenzar 🍸',
    accountBtn: 'Crear cuenta para sincronizar entre dispositivos',
    dashContinue: 'Seguir Aprendiendo', dashBadges: 'Insignias Recientes',
    learnTitle: 'Todos los Módulos', practiceTitle: 'Práctica de IA — Juego de Rol',
    practiceSub: 'Elige un escenario. Tú juegas al mesero — la IA juega al cliente. Recibe coaching instantáneo después de cada respuesta.',
    chatBack: '← Volver', chatHint: 'Eres el mesero. Escribe o habla tu respuesta.',
    voiceLabel: 'Voz', aiSpeechLabel: '🔊', sendLabel: 'Enviar', listening: 'Escuchando...',
    achieveTitle: 'Logros', achieveSub: 'Gana insignias completando módulos, escenarios y rachas diarias.',
    streakSection: 'Tu Racha', streakCurrent: 'Actual', streakBest: 'Mejor',
    scenariosDone: 'Escenarios', badgesTitle: 'Insignias',
    lbTitle: 'Tabla de Líderes', lbSub: 'Los mejores aprendices de ServeMaster Academy.',
    mgrTitle: 'Panel del Gerente', mgrSub: 'Monitorea el progreso de formación de tu equipo.',
    mgrSetupTitle: 'Configura tu Restaurante', mgrSetupSub: 'Crea un perfil de restaurante para invitar y gestionar la formación de tu personal.',
    mgrCreateBtn: 'Crear Restaurante', mgrOr: 'o', mgrJoinSub: 'Únete a un restaurante existente con un código de invitación:',
    mgrJoinBtn: 'Unirse', mgrStaffTitle: 'Progreso del Personal', mgrExportBtn: 'Exportar CSV', mgrInviteBtn: 'Copiar Enlace de Invitación',
    nlTitle: 'Consejos Mensuales para Meseros', nlSub: 'Recibe consejos exclusivos, nuevos escenarios y conocimiento vinícola mensualmente. Sin spam.',
    certTitle: '🎓 ¡Certificado Listo!', certSub: 'Has completado los 12 módulos. Descarga tu certificado.', certBtn: 'Descargar PDF',
    dayStreak: 'días de racha', streakBestLabel: 'Mejor',
    dashNewsletterBtn: '📬 Boletín mensual de consejos',
    noStaff: 'Ningún miembro del personal se ha unido todavía. Comparte el código de invitación para comenzar.',
  }
};"""
)

# =============================================================
# 3. setLang function — add ES support
# =============================================================
rp(
    """function setLang(l) {
  lang = l;
  localStorage.setItem('sma-lang', l);
  document.getElementById('lang-en').classList.toggle('active', l === 'en');
  document.getElementById('lang-fr').classList.toggle('active', l === 'fr');
  applyLangStrings();
}""",
    """function setLang(l) {
  lang = l;
  localStorage.setItem('sma-lang', l);
  document.getElementById('lang-en').classList.toggle('active', l === 'en');
  document.getElementById('lang-fr').classList.toggle('active', l === 'fr');
  const esBtn = document.getElementById('lang-es'); if (esBtn) esBtn.classList.toggle('active', l === 'es');
  applyLangStrings();
}"""
)

# =============================================================
# 4. Module title / lesson / quiz helper functions
# =============================================================
rp(
    "function getModuleTitle(m) { return lang === 'fr' && m.titleFr ? m.titleFr : m.title; }",
    "function getModuleTitle(m) { return lang === 'es' && m.titleEs ? m.titleEs : lang === 'fr' && m.titleFr ? m.titleFr : m.title; }"
)
rp(
    "function getLessonTitle(l) { return lang === 'fr' && l.titleFr ? l.titleFr : l.title; }",
    "function getLessonTitle(l) { return lang === 'es' && l.titleEs ? l.titleEs : lang === 'fr' && l.titleFr ? l.titleFr : l.title; }"
)
rp(
    "function getLessonBody(l) { return lang === 'fr' && l.bodyFr ? l.bodyFr : l.body; }",
    "function getLessonBody(l) { return lang === 'es' && l.bodyEs ? l.bodyEs : lang === 'fr' && l.bodyFr ? l.bodyFr : l.body; }"
)

# =============================================================
# 5. modules array — add titleEs
# =============================================================
rp(
    "  { id:1,  title:'Foundations of Exceptional Service',         titleFr:\"Fondements du service d'exception\",              emoji:'🌟', mins:10 },",
    "  { id:1,  title:'Foundations of Exceptional Service',         titleFr:\"Fondements du service d'exception\",              titleEs:'Fundamentos del Servicio Excepcional',      emoji:'🌟', mins:10 },"
)
rp(
    "  { id:2,  title:'Seating, Menus & Taking Orders',            titleFr:'Placement, menus & prise de commandes',           emoji:'📋', mins:10 },",
    "  { id:2,  title:'Seating, Menus & Taking Orders',            titleFr:'Placement, menus & prise de commandes',           titleEs:'Acomodar, Menús y Tomar Pedidos',           emoji:'📋', mins:10 },"
)
rp(
    "  { id:3,  title:'Beverage Mastery: Wine & Cocktail Service', titleFr:'Maîtrise des boissons : vins & cocktails',        emoji:'🍸', mins:12 },",
    "  { id:3,  title:'Beverage Mastery: Wine & Cocktail Service', titleFr:'Maîtrise des boissons : vins & cocktails',        titleEs:'Dominio de Bebidas: Vino y Cócteles',       emoji:'🍸', mins:12 },"
)
rp(
    "  { id:4,  title:'Wine Pairing & Advanced Beverage Knowledge',titleFr:'Accords mets-vins & connaissances avancées',      emoji:'🥂', mins:12 },",
    "  { id:4,  title:'Wine Pairing & Advanced Beverage Knowledge',titleFr:'Accords mets-vins & connaissances avancées',      titleEs:'Maridaje de Vinos y Conocimiento Avanzado', emoji:'🥂', mins:12 },"
)
rp(
    "  { id:5,  title:'Natural & Effective Upselling',             titleFr:'Vente additionnelle naturelle & efficace',         emoji:'💰', mins:10 },",
    "  { id:5,  title:'Natural & Effective Upselling',             titleFr:'Vente additionnelle naturelle & efficace',         titleEs:'Venta Sugestiva Natural y Efectiva',        emoji:'💰', mins:10 },"
)
rp(
    "  { id:6,  title:'Food Service & Perfect Pacing',             titleFr:'Service des plats & rythme parfait',              emoji:'🍽️', mins:10 },",
    "  { id:6,  title:'Food Service & Perfect Pacing',             titleFr:'Service des plats & rythme parfait',              titleEs:'Servicio de Alimentos y Ritmo Perfecto',    emoji:'🍽️', mins:10 },"
)
rp(
    "  { id:7,  title:'Table Maintenance & Problem Resolution',    titleFr:\"Entretien des tables & résolution de problèmes\",  emoji:'🧼', mins:10 },",
    "  { id:7,  title:'Table Maintenance & Problem Resolution',    titleFr:\"Entretien des tables & résolution de problèmes\",  titleEs:'Mantenimiento de Mesas y Resolución de Problemas', emoji:'🧼', mins:10 },"
)
rp(
    "  { id:8,  title:'International Etiquette',                   titleFr:'Étiquette internationale',                        emoji:'🌍', mins:8  },",
    "  { id:8,  title:'International Etiquette',                   titleFr:'Étiquette internationale',                        titleEs:'Etiqueta Internacional',                    emoji:'🌍', mins:8  },"
)
rp(
    "  { id:9,  title:'Special Occasions Mastery',                 titleFr:'Maîtrise des occasions spéciales',                emoji:'🎂', mins:10 },",
    "  { id:9,  title:'Special Occasions Mastery',                 titleFr:'Maîtrise des occasions spéciales',                titleEs:'Dominio de Ocasiones Especiales',           emoji:'🎂', mins:10 },"
)
rp(
    "  { id:10, title:'Closing the Experience',                    titleFr:\"Clore l'expérience\",                              emoji:'👋', mins:8  },",
    "  { id:10, title:'Closing the Experience',                    titleFr:\"Clore l'expérience\",                              titleEs:'Cerrar la Experiencia',                     emoji:'👋', mins:8  },"
)
rp(
    "  { id:11, title:'Advanced Wine Regions',                     titleFr:'Régions viticoles avancées',                      emoji:'🌎', mins:12 },",
    "  { id:11, title:'Advanced Wine Regions',                     titleFr:'Régions viticoles avancées',                      titleEs:'Regiones Vitivinícolas Avanzadas',          emoji:'🌎', mins:12 },"
)
rp(
    "  { id:12, title:'Server Leadership & Career',                titleFr:'Leadership & carrière en service',                emoji:'⭐', mins:10 }",
    "  { id:12, title:'Server Leadership & Career',                titleFr:'Leadership & carrière en service',                titleEs:'Liderazgo del Mesero y Carrera Profesional',emoji:'⭐', mins:10 }"
)

# =============================================================
# 6. BADGE_DEFS — add nameEs/descEs
# =============================================================
rp(
    "{ id:'first_module', icon:'🎯', name:'First Steps', nameFr:'Premiers Pas', desc:'Complete your first module', descFr:'Complétez votre premier module' },",
    "{ id:'first_module', icon:'🎯', name:'First Steps', nameFr:'Premiers Pas', nameEs:'Primeros Pasos', desc:'Complete your first module', descFr:'Complétez votre premier module', descEs:'Completa tu primer módulo' },"
)
rp(
    "{ id:'module_master', icon:'🏆', name:'Module Master', nameFr:'Maître des modules', desc:'Complete all 12 modules', descFr:'Complétez les 12 modules' },",
    "{ id:'module_master', icon:'🏆', name:'Module Master', nameFr:'Maître des modules', nameEs:'Maestro de Módulos', desc:'Complete all 12 modules', descFr:'Complétez les 12 modules', descEs:'Completa los 12 módulos' },"
)
rp(
    "{ id:'first_scenario', icon:'🎭', name:'Scene Stealer', nameFr:'Acteur en herbe', desc:'Complete your first role-play', descFr:'Complétez votre premier jeu de rôle' },",
    "{ id:'first_scenario', icon:'🎭', name:'Scene Stealer', nameFr:'Acteur en herbe', nameEs:'Protagonista', desc:'Complete your first role-play', descFr:'Complétez votre premier jeu de rôle', descEs:'Completa tu primer juego de rol' },"
)
rp(
    "{ id:'scenario_ace', icon:'🌟', name:'Scenario Ace', nameFr:'As des scénarios', desc:'Complete 10 role-play scenarios', descFr:'Complétez 10 scénarios de jeu de rôle' },",
    "{ id:'scenario_ace', icon:'🌟', name:'Scenario Ace', nameFr:'As des scénarios', nameEs:'As de Escenarios', desc:'Complete 10 role-play scenarios', descFr:'Complétez 10 scénarios de jeu de rôle', descEs:'Completa 10 escenarios de juego de rol' },"
)
rp(
    "{ id:'scenario_legend', icon:'👑', name:'Scenario Legend', nameFr:'Légende des scénarios', desc:'Complete 20 role-play scenarios', descFr:'Complétez 20 scénarios' },",
    "{ id:'scenario_legend', icon:'👑', name:'Scenario Legend', nameFr:'Légende des scénarios', nameEs:'Leyenda de Escenarios', desc:'Complete 20 role-play scenarios', descFr:'Complétez 20 scénarios', descEs:'Completa 20 escenarios de juego de rol' },"
)
rp(
    "{ id:'week_warrior', icon:'🔥', name:'Week Warrior', nameFr:'Guerrier de la semaine', desc:'7-day learning streak', descFr:\"Série de 7 jours d'apprentissage\" },",
    "{ id:'week_warrior', icon:'🔥', name:'Week Warrior', nameFr:'Guerrier de la semaine', nameEs:'Guerrero Semanal', desc:'7-day learning streak', descFr:\"Série de 7 jours d'apprentissage\", descEs:'Racha de aprendizaje de 7 días' },"
)
rp(
    "{ id:'month_master', icon:'💎', name:'Month Master', nameFr:'Maître du mois', desc:'30-day learning streak', descFr:'Série de 30 jours' },",
    "{ id:'month_master', icon:'💎', name:'Month Master', nameFr:'Maître du mois', nameEs:'Maestro del Mes', desc:'30-day learning streak', descFr:'Série de 30 jours', descEs:'Racha de aprendizaje de 30 días' },"
)
rp(
    "{ id:'wine_expert', icon:'🍷', name:'Wine Expert', nameFr:'Expert en vins', desc:'Complete all beverage modules', descFr:'Complétez tous les modules boissons' },",
    "{ id:'wine_expert', icon:'🍷', name:'Wine Expert', nameFr:'Expert en vins', nameEs:'Experto en Vinos', desc:'Complete all beverage modules', descFr:'Complétez tous les modules boissons', descEs:'Completa todos los módulos de bebidas' },"
)
rp(
    "{ id:'perfect_scorer', icon:'💯', name:'Perfect Scorer', nameFr:'Score parfait', desc:'Score 100% on 5 quizzes', descFr:'Obtenez 100% sur 5 quiz' },",
    "{ id:'perfect_scorer', icon:'💯', name:'Perfect Scorer', nameFr:'Score parfait', nameEs:'Puntuación Perfecta', desc:'Score 100% on 5 quizzes', descFr:'Obtenez 100% sur 5 quiz', descEs:'Obtén 100% en 5 cuestionarios' },"
)
rp(
    "{ id:'voice_pro', icon:'🎤', name:'Voice Pro', nameFr:'Pro de la voix', desc:'Complete 3 voice sessions', descFr:'Complétez 3 sessions vocales' },",
    "{ id:'voice_pro', icon:'🎤', name:'Voice Pro', nameFr:'Pro de la voix', nameEs:'Pro de la Voz', desc:'Complete 3 voice sessions', descFr:'Complétez 3 sessions vocales', descEs:'Completa 3 sesiones de práctica vocal' },"
)
rp(
    "{ id:'bilingual', icon:'🌍', name:'Bilingual', nameFr:'Bilingue', desc:'Use French mode', descFr:'Utilisez le mode français' },",
    "{ id:'bilingual', icon:'🌍', name:'Bilingual', nameFr:'Bilingue', nameEs:'Multilingüe', desc:'Use French mode', descFr:'Utilisez le mode français', descEs:'Usa el modo español' },"
)
rp(
    "{ id:'speed_learner', icon:'⚡', name:'Speed Learner', nameFr:'Apprenant rapide', desc:'Complete 3 modules in one day', descFr:'Complétez 3 modules en un jour' },",
    "{ id:'speed_learner', icon:'⚡', name:'Speed Learner', nameFr:'Apprenant rapide', nameEs:'Aprendiz Veloz', desc:'Complete 3 modules in one day', descFr:'Complétez 3 modules en un jour', descEs:'Completa 3 módulos en un día' },"
)

# =============================================================
# 7. bilingual badge trigger — add ES
# =============================================================
rp(
    "  if (lang === 'fr' && !earnedBadges.includes('bilingual')) newBadges.push('bilingual');",
    "  if ((lang === 'fr' || lang === 'es') && !earnedBadges.includes('bilingual')) newBadges.push('bilingual');"
)

# =============================================================
# 8. showBadgeNotification — support ES
# =============================================================
rp(
    "  document.getElementById('badge-notif-name').textContent = lang === 'fr' ? def.nameFr : def.name;",
    "  document.getElementById('badge-notif-name').textContent = lang === 'es' && def.nameEs ? def.nameEs : lang === 'fr' ? def.nameFr : def.name;"
)
rp(
    "  document.getElementById('badge-notif-desc').textContent = lang === 'fr' ? def.descFr : def.desc;",
    "  document.getElementById('badge-notif-desc').textContent = lang === 'es' && def.descEs ? def.descEs : lang === 'fr' ? def.descFr : def.desc;"
)

# =============================================================
# 9. practiceScenarios — add titleEs/descEs
# =============================================================
rp(
    "  { id:1,  emoji:'😤', title:'The Difficult Guest',        titleFr:'Le client difficile',                 desc:'De-escalate an angry, impatient guest at the door.',            descFr:'Désamorcez un client en colère et impatient à l\\'entrée.',                   difficulty:'Beginner'     },",
    "  { id:1,  emoji:'😤', title:'The Difficult Guest',        titleFr:'Le client difficile',                 titleEs:'El Cliente Difícil',              desc:'De-escalate an angry, impatient guest at the door.',            descFr:'Désamorcez un client en colère et impatient à l\\'entrée.',                   descEs:'Desescala a un cliente enojado e impaciente en la puerta.',   difficulty:'Beginner'     },"
)
rp(
    "  { id:2,  emoji:'🍷', title:'Wine Upselling',             titleFr:'Vente additionnelle de vin',          desc:'Guide an uncertain couple to the right bottle.',                descFr:'Guidez un couple incertain vers la bonne bouteille.',                         difficulty:'Beginner'     },",
    "  { id:2,  emoji:'🍷', title:'Wine Upselling',             titleFr:'Vente additionnelle de vin',          titleEs:'Venta de Vino',                   desc:'Guide an uncertain couple to the right bottle.',                descFr:'Guidez un couple incertain vers la bonne bouteille.',                         descEs:'Guía a una pareja indecisa hacia la botella correcta.',        difficulty:'Beginner'     },"
)
rp(
    "  { id:4,  emoji:'⏱️', title:'The Long Wait Complaint',    titleFr:'La plainte d\\'attente',               desc:'Recover a frustrated guest waiting 45 minutes.',                descFr:'Récupérez un client frustré qui attend depuis 45 minutes.',                   difficulty:'Beginner'     },",
    "  { id:4,  emoji:'⏱️', title:'The Long Wait Complaint',    titleFr:'La plainte d\\'attente',               titleEs:'La Queja por la Espera',          desc:'Recover a frustrated guest waiting 45 minutes.',                descFr:'Récupérez un client frustré qui attend depuis 45 minutes.',                   descEs:'Recupera a un cliente frustrado que lleva 45 minutos esperando.', difficulty:'Beginner'  },"
)
rp(
    "  { id:6,  emoji:'🎂', title:'Birthday Celebration',       titleFr:'Célébration d\\'anniversaire',         desc:'Take a surprise 40th birthday booking by phone.',               descFr:'Prenez une réservation surprise de 40e anniversaire par téléphone.',          difficulty:'Beginner'     },",
    "  { id:6,  emoji:'🎂', title:'Birthday Celebration',       titleFr:'Célébration d\\'anniversaire',         titleEs:'Celebración de Cumpleaños',       desc:'Take a surprise 40th birthday booking by phone.',               descFr:'Prenez une réservation surprise de 40e anniversaire par téléphone.',          descEs:'Toma una reserva sorpresa de cumpleaños número 40 por teléfono.', difficulty:'Beginner'   },"
)
rp(
    "  { id:9,  emoji:'🤔', title:'The Indecisive Guest',       titleFr:'Le client indécis',                   desc:'Guide an overwhelmed guest to their perfect dish.',             descFr:'Guidez un client dépassé vers son plat parfait.',                             difficulty:'Beginner'     },",
    "  { id:9,  emoji:'🤔', title:'The Indecisive Guest',       titleFr:'Le client indécis',                   titleEs:'El Cliente Indeciso',             desc:'Guide an overwhelmed guest to their perfect dish.',             descFr:'Guidez un client dépassé vers son plat parfait.',                             descEs:'Guía a un cliente abrumado hacia su plato perfecto.',          difficulty:'Beginner'     },"
)
rp(
    "  { id:10, emoji:'❌', title:'Wrong Order Delivered',      titleFr:'Mauvaise commande livrée',            desc:'Recover from bringing the wrong dish gracefully.',              descFr:'Récupérez gracieusement après avoir apporté le mauvais plat.',                difficulty:'Beginner'     },",
    "  { id:10, emoji:'❌', title:'Wrong Order Delivered',      titleFr:'Mauvaise commande livrée',            titleEs:'Pedido Incorrecto Entregado',      desc:'Recover from bringing the wrong dish gracefully.',              descFr:'Récupérez gracieusement après avoir apporté le mauvais plat.',                descEs:'Recupera la situación tras llevar el plato equivocado.',       difficulty:'Beginner'     },"
)
rp(
    "  { id:7,  emoji:'🧾', title:'Splitting the Bill',         titleFr:'Partager la note',                    desc:'Handle a complicated 7-person split bill.',                     descFr:'Gérez une note compliquée à partager entre 7 personnes.',                     difficulty:'Intermediate' },",
    "  { id:7,  emoji:'🧾', title:'Splitting the Bill',         titleFr:'Partager la note',                    titleEs:'Dividir la Cuenta',               desc:'Handle a complicated 7-person split bill.',                     descFr:'Gérez une note compliquée à partager entre 7 personnes.',                     descEs:'Maneja una cuenta complicada dividida entre 7 personas.',     difficulty:'Intermediate' },"
)
rp(
    "  { id:14, emoji:'💍', title:'The Marriage Proposal',      titleFr:'La demande en mariage',               desc:'Coordinate the perfect surprise proposal moment.',              descFr:'Coordonnez le parfait moment de demande surprise.',                           difficulty:'Intermediate' },",
    "  { id:14, emoji:'💍', title:'The Marriage Proposal',      titleFr:'La demande en mariage',               titleEs:'La Propuesta de Matrimonio',      desc:'Coordinate the perfect surprise proposal moment.',              descFr:'Coordonnez le parfait moment de demande surprise.',                           descEs:'Coordina el momento perfecto de la propuesta sorpresa.',      difficulty:'Intermediate' },"
)
rp(
    "  { id:17, emoji:'🌱', title:'Vegan Tasting Menu',         titleFr:'Menu dégustation végane',             desc:'Navigate a fully vegan tasting menu with confidence.',           descFr:'Naviguez un menu dégustation entièrement végane avec confiance.',             difficulty:'Intermediate' },",
    "  { id:17, emoji:'🌱', title:'Vegan Tasting Menu',         titleFr:'Menu dégustation végane',             titleEs:'Menú Degustación Vegano',         desc:'Navigate a fully vegan tasting menu with confidence.',           descFr:'Naviguez un menu dégustation entièrement végane avec confiance.',             descEs:'Navega un menú de degustación completamente vegano con confianza.', difficulty:'Intermediate' },"
)
rp(
    "  { id:19, emoji:'⏰', title:'Last Orders Rush',           titleFr:'Dernières commandes en urgence',      desc:'Handle a guest arriving 30 minutes before kitchen close.',      descFr:'Gérez un client arrivant 30 minutes avant la fermeture de la cuisine.',       difficulty:'Intermediate' },",
    "  { id:19, emoji:'⏰', title:'Last Orders Rush',           titleFr:'Dernières commandes en urgence',      titleEs:'Últimos Pedidos del Servicio',    desc:'Handle a guest arriving 30 minutes before kitchen close.',      descFr:'Gérez un client arrivant 30 minutes avant la fermeture de la cuisine.',       descEs:'Atiende a un cliente que llega 30 minutos antes del cierre de cocina.', difficulty:'Intermediate' },"
)
rp(
    "  { id:23, emoji:'🔊', title:'Noise Complaint',            titleFr:'Plainte de bruit',                    desc:'Mediate between a quiet couple and a rowdy table.',             descFr:'Médiez entre un couple tranquille et une table bruyante.',                    difficulty:'Intermediate' },",
    "  { id:23, emoji:'🔊', title:'Noise Complaint',            titleFr:'Plainte de bruit',                    titleEs:'Queja de Ruido',                  desc:'Mediate between a quiet couple and a rowdy table.',             descFr:'Médiez entre un couple tranquille et une table bruyante.',                    descEs:'Media entre una pareja tranquila y una mesa ruidosa.',        difficulty:'Intermediate' },"
)
rp(
    "  { id:28, emoji:'🌾', title:'Celiac Disease',             titleFr:'Maladie cœliaque',                    desc:'Handle celiac disease concerns with medical seriousness.',       descFr:'Gérez sérieusement les inquiétudes liées à la maladie cœliaque.',             difficulty:'Intermediate' },",
    "  { id:28, emoji:'🌾', title:'Celiac Disease',             titleFr:'Maladie cœliaque',                    titleEs:'Enfermedad Celíaca',              desc:'Handle celiac disease concerns with medical seriousness.',       descFr:'Gérez sérieusement les inquiétudes liées à la maladie cœliaque.',             descEs:'Maneja las inquietudes sobre la celiaquía con seriedad médica.', difficulty:'Intermediate' },"
)
rp(
    "  { id:11, emoji:'🍾', title:'Premium Wine Decanting',     titleFr:'Décantage de vin premium',            desc:'Perform flawless tableside Barolo decanting.',                  descFr:'Effectuez un décantage impeccable de Barolo en salle.',                       difficulty:'Advanced'     },",
    "  { id:11, emoji:'🍾', title:'Premium Wine Decanting',     titleFr:'Décantage de vin premium',            titleEs:'Decantación de Vino Premium',     desc:'Perform flawless tableside Barolo decanting.',                  descFr:'Effectuez un décantage impeccable de Barolo en salle.',                       descEs:'Realiza una decantación impecable de Barolo en la mesa.',     difficulty:'Advanced'     },"
)
rp(
    "  { id:12, emoji:'👥', title:'Large Group Chaos',          titleFr:'Chaos de grand groupe',               desc:'Coordinate a party of 16 with dietary chaos.',                  descFr:'Coordonnez un groupe de 16 avec des restrictions alimentaires.',               difficulty:'Advanced'     },",
    "  { id:12, emoji:'👥', title:'Large Group Chaos',          titleFr:'Chaos de grand groupe',               titleEs:'Caos de Grupo Grande',            desc:'Coordinate a party of 16 with dietary chaos.',                  descFr:'Coordonnez un groupe de 16 avec des restrictions alimentaires.',               descEs:'Coordina un grupo de 16 personas con restricciones alimentarias.', difficulty:'Advanced'   },"
)
rp(
    "  { id:13, emoji:'🚨', title:'Severe Allergy Emergency',   titleFr:'Urgence allergie sévère',             desc:'Handle a potential anaphylactic situation at the table.',        descFr:'Gérez une situation anaphylactique potentielle à table.',                     difficulty:'Advanced'     },",
    "  { id:13, emoji:'🚨', title:'Severe Allergy Emergency',   titleFr:'Urgence allergie sévère',             titleEs:'Emergencia de Alergia Grave',     desc:'Handle a potential anaphylactic situation at the table.',        descFr:'Gérez une situation anaphylactique potentielle à table.',                     descEs:'Maneja una posible situación anafiláctica en la mesa.',       difficulty:'Advanced'     },"
)
rp(
    "  { id:18, emoji:'📝', title:'The Food Critic',            titleFr:'Le critique gastronomique',           desc:'Impress a discreet restaurant reviewer.',                       descFr:'Impressionnez un critique gastronomique discret.',                            difficulty:'Advanced'     },",
    "  { id:18, emoji:'📝', title:'The Food Critic',            titleFr:'Le critique gastronomique',           titleEs:'El Crítico Gastronómico',         desc:'Impress a discreet restaurant reviewer.',                       descFr:'Impressionnez un critique gastronomique discret.',                            descEs:'Impresiona a un crítico de restaurante discreto.',            difficulty:'Advanced'     },"
)
rp(
    "  { id:22, emoji:'🏥', title:'Medical Situation',          titleFr:'Situation médicale',                  desc:'Take control when a guest collapses at another table.',          descFr:'Prenez le contrôle quand un client s\\'effondre à une autre table.',           difficulty:'Advanced'     },",
    "  { id:22, emoji:'🏥', title:'Medical Situation',          titleFr:'Situation médicale',                  titleEs:'Situación Médica',                desc:'Take control when a guest collapses at another table.',          descFr:'Prenez le contrôle quand un client s\\'effondre à une autre table.',           descEs:'Toma el control cuando un cliente se desmaya en otra mesa.',  difficulty:'Advanced'     },"
)
rp(
    "  { id:25, emoji:'🎓', title:'Sommelier Knowledge Test',   titleFr:'Test de connaissance en sommellerie', desc:'Impress a highly knowledgeable wine guest.',                    descFr:'Impressionnez un client très bien informé en vins.',                          difficulty:'Advanced'     },",
    "  { id:25, emoji:'🎓', title:'Sommelier Knowledge Test',   titleFr:'Test de connaissance en sommellerie', titleEs:'Prueba de Conocimiento de Sumillería', desc:'Impress a highly knowledgeable wine guest.',                descFr:'Impressionnez un client très bien informé en vins.',                          descEs:'Impresiona a un cliente muy conocedor de vinos.',             difficulty:'Advanced'     },"
)

# =============================================================
# 10. DIFFICULTY_LEVELS — add labelEs
# =============================================================
rp(
    "  { key:'Beginner',     label:'Beginner',     labelFr:'Débutant',      hdrCls:'text-emerald-400', borderCls:'border-emerald-800/40' },",
    "  { key:'Beginner',     label:'Beginner',     labelFr:'Débutant',      labelEs:'Principiante', hdrCls:'text-emerald-400', borderCls:'border-emerald-800/40' },"
)
rp(
    "  { key:'Intermediate', label:'Intermediate', labelFr:'Intermédiaire', hdrCls:'text-amber-400',   borderCls:'border-amber-800/40'   },",
    "  { key:'Intermediate', label:'Intermediate', labelFr:'Intermédiaire', labelEs:'Intermedio',   hdrCls:'text-amber-400',   borderCls:'border-amber-800/40'   },"
)
rp(
    "  { key:'Advanced',     label:'Advanced',     labelFr:'Avancé',        hdrCls:'text-red-400',     borderCls:'border-red-800/40'     },",
    "  { key:'Advanced',     label:'Advanced',     labelFr:'Avancé',        labelEs:'Avanzado',     hdrCls:'text-red-400',     borderCls:'border-red-800/40'     },"
)

# DIFFICULTY_STYLES
rp(
    "  Beginner:     { label:'Beginner',     labelFr:'Débutant',     cls:'bg-emerald-900/60 text-emerald-300 border-emerald-700' },",
    "  Beginner:     { label:'Beginner',     labelFr:'Débutant',     labelEs:'Principiante', cls:'bg-emerald-900/60 text-emerald-300 border-emerald-700' },"
)
rp(
    "  Intermediate: { label:'Intermediate', labelFr:'Intermédiaire',cls:'bg-amber-900/60 text-amber-300 border-amber-700'     },",
    "  Intermediate: { label:'Intermediate', labelFr:'Intermédiaire',labelEs:'Intermedio',   cls:'bg-amber-900/60 text-amber-300 border-amber-700'     },"
)

# =============================================================
# 11. renderScenarios — update lang checks to support ES
# =============================================================
rp(
    "    const levelLabel = lang === 'fr' ? level.labelFr : level.label;",
    "    const levelLabel = lang === 'es' && level.labelEs ? level.labelEs : lang === 'fr' ? level.labelFr : level.label;"
)
rp(
    "      const title = lang === 'fr' && s.titleFr ? s.titleFr : s.title;",
    "      const title = lang === 'es' && s.titleEs ? s.titleEs : lang === 'fr' && s.titleFr ? s.titleFr : s.title;"
)
rp(
    "      const desc  = lang === 'fr' && s.descFr  ? s.descFr  : s.desc;",
    "      const desc  = lang === 'es' && s.descEs  ? s.descEs  : lang === 'fr' && s.descFr  ? s.descFr  : s.desc;"
)
rp(
    "      const diffLabel = lang === 'fr' ? diff.labelFr : diff.label;",
    "      const diffLabel = lang === 'es' && diff.labelEs ? diff.labelEs : lang === 'fr' ? diff.labelFr : diff.label;"
)

# =============================================================
# 12. startChat — title lookup and summary heading
# =============================================================
rp(
    "  const title = lang === 'fr' && s.titleFr ? s.titleFr : s.title;",
    "  const title = lang === 'es' && s.titleEs ? s.titleEs : lang === 'fr' && s.titleFr ? s.titleFr : s.title;"
)

# =============================================================
# 13. getModuleContent — subtitle + quiz/voice labels
# =============================================================
rp(
    "  const subtitle = lang === 'fr' && data.subtitleFr ? data.subtitleFr : data.subtitle;",
    "  const subtitle = lang === 'es' && data.subtitleEs ? data.subtitleEs : lang === 'fr' && data.subtitleFr ? data.subtitleFr : data.subtitle;"
)
rp(
    "    html += `<div class=\"mb-10\"><h4 class=\"text-xl font-semibold mb-4\">🎤 Voice Role-Play: Cocktail Upselling</h4><button onclick=\"startVoiceRoleplay()\" class=\"w-full bg-white hover:bg-amber-100 text-black py-6 rounded-3xl font-semibold flex items-center justify-center gap-3\">🎤 ${lang==='fr'?'Démarrer la pratique vocale':'Start Voice Practice'}</button><div id=\"voice-feedback\" class=\"mt-6 text-center min-h-[80px] text-sm\"></div></div>`;",
    "    html += `<div class=\"mb-10\"><h4 class=\"text-xl font-semibold mb-4\">🎤 Voice Role-Play: Cocktail Upselling</h4><button onclick=\"startVoiceRoleplay()\" class=\"w-full bg-white hover:bg-amber-100 text-black py-6 rounded-3xl font-semibold flex items-center justify-center gap-3\">🎤 ${lang==='es'?'Iniciar práctica vocal':lang==='fr'?'Démarrer la pratique vocale':'Start Voice Practice'}</button><div id=\"voice-feedback\" class=\"mt-6 text-center min-h-[80px] text-sm\"></div></div>`;"
)
rp(
    "    const quizLabel = lang === 'fr' ? '📝 Quiz Rapide' : '📝 Quick Quiz';",
    "    const quizLabel = lang === 'es' ? '📝 Cuestionario Rápido' : lang === 'fr' ? '📝 Quiz Rapide' : '📝 Quick Quiz';"
)
rp(
    "    const completeLabel = lang === 'fr' ? '✅ Marquer comme terminé' : '✅ Mark Lesson Complete';",
    "    const completeLabel = lang === 'es' ? '✅ Marcar como completado' : lang === 'fr' ? '✅ Marquer comme terminé' : '✅ Mark Lesson Complete';"
)
rp(
    "      const question = lang === 'fr' && q.qFr ? q.qFr : q.q;",
    "      const question = lang === 'es' && q.qEs ? q.qEs : lang === 'fr' && q.qFr ? q.qFr : q.q;"
)
rp(
    "      const options = lang === 'fr' && q.optionsFr ? q.optionsFr : q.options;",
    "      const options = lang === 'es' && q.optionsEs ? q.optionsEs : lang === 'fr' && q.optionsFr ? q.optionsFr : q.options;"
)

# =============================================================
# 14. buildTraySimulator — labels
# =============================================================
rp(
    "  const heading = lang === 'fr' ? '🪑 Simulateur de plateau - Équilibre' : '🪑 Tray Balance Simulator';",
    "  const heading = lang === 'es' ? '🪑 Simulador de Bandeja — Equilibrio' : lang === 'fr' ? '🪑 Simulateur de plateau - Équilibre' : '🪑 Tray Balance Simulator';"
)
rp(
    "  const startBtn = lang === 'fr' ? 'Démarrer la simulation' : 'Start Simulation';",
    "  const startBtn = lang === 'es' ? 'Iniciar simulación' : lang === 'fr' ? 'Démarrer la simulation' : 'Start Simulation';"
)
rp(
    "  const instrDesktop = lang === 'fr' ? 'Déplacez la souris sur le plateau pour simuler l\\'inclinaison.' : 'Move your mouse over the tray to simulate tilting. On mobile, tilt your device!';",
    "  const instrDesktop = lang === 'es' ? 'Mueve el ratón sobre la bandeja para simular la inclinación. ¡En móvil, inclina el dispositivo!' : lang === 'fr' ? 'Déplacez la souris sur le plateau pour simuler l\\'inclinaison.' : 'Move your mouse over the tray to simulate tilting. On mobile, tilt your device!';"
)
rp(
    "  const instrMobile = lang === 'fr' ? 'Inclinez votre appareil pour équilibrer les verres!' : 'Tilt your device to balance the glasses!';",
    "  const instrMobile = lang === 'es' ? '¡Inclina tu dispositivo para equilibrar los vasos!' : lang === 'fr' ? 'Inclinez votre appareil pour équilibrer les verres!' : 'Tilt your device to balance the glasses!';"
)
rp(
    "  document.getElementById('tray-status').textContent = lang==='fr' ? 'En équilibre... inclinez pour bouger les verres!' : 'Balancing... tilt to move glasses!';",
    "  document.getElementById('tray-status').textContent = lang==='es' ? 'Equilibrando... ¡inclina para mover los vasos!' : lang==='fr' ? 'En équilibre... inclinez pour bouger les verres!' : 'Balancing... tilt to move glasses!';"
)
rp(
    "    if (statusEl) statusEl.textContent = lang==='fr' ? 'Tous les verres sont tombés!' : 'All glasses fell!';",
    "    if (statusEl) statusEl.textContent = lang==='es' ? '¡Todos los vasos cayeron!' : lang==='fr' ? 'Tous les verres sont tombés!' : 'All glasses fell!';"
)

# =============================================================
# 15. startVoiceRoleplay — feedback + rec.lang
# =============================================================
rp(
    "  feedback.innerHTML = `🎤 ${lang==='fr'?'Écoute... Parlez votre upsell!':'Listening... Speak your upsell!'}`;",
    "  feedback.innerHTML = `🎤 ${lang==='es'?'Escuchando... ¡Habla tu propuesta de venta!':lang==='fr'?'Écoute... Parlez votre upsell!':'Listening... Speak your upsell!'}`;",
)
rp(
    "  if (!SpeechRecognition) { feedback.innerHTML = lang==='fr'?'Voix non supportée dans ce navigateur':'Voice not supported in this browser'; return; }",
    "  if (!SpeechRecognition) { feedback.innerHTML = lang==='es'?'Voz no soportada en este navegador':lang==='fr'?'Voix non supportée dans ce navigateur':'Voice not supported in this browser'; return; }"
)
rp(
    "  rec.lang = lang === 'fr' ? 'fr-FR' : 'en-US';\n  rec.onresult = (e) => {\n    const text = e.results[0][0].transcript;\n    feedback.innerHTML = `✅ \"${escHtml(text)}\"<br><span class=\"text-emerald-400\">${lang==='fr'?'Excellent upsell!':'You nailed the upsell!'}</span>`;",
    "  rec.lang = lang === 'es' ? 'es-ES' : lang === 'fr' ? 'fr-FR' : 'en-US';\n  rec.onresult = (e) => {\n    const text = e.results[0][0].transcript;\n    feedback.innerHTML = `✅ \"${escHtml(text)}\"<br><span class=\"text-emerald-400\">${lang==='es'?'¡Excelente propuesta de venta!':lang==='fr'?'Excellent upsell!':'You nailed the upsell!'}</span>`;"
)
rp(
    "  rec.onerror = () => { feedback.innerHTML = lang==='fr'?'Erreur de reconnaissance vocale':'Voice recognition error'; };",
    "  rec.onerror = () => { feedback.innerHTML = lang==='es'?'Error de reconocimiento de voz':lang==='fr'?'Erreur de reconnaissance vocale':'Voice recognition error'; };"
)

# =============================================================
# 16. speakText — utt.lang
# =============================================================
rp(
    "  utt.lang = lang === 'fr' ? 'fr-FR' : 'en-US';",
    "  utt.lang = lang === 'es' ? 'es-ES' : lang === 'fr' ? 'fr-FR' : 'en-US';"
)

# =============================================================
# 17. Voice input recording statuses
# =============================================================
rp(
    "      if (listeningText) listeningText.textContent = lang === 'fr' ? 'Enregistrement... (cliquez 🎤 pour arrêter)' : 'Recording... (click 🎤 to stop)';",
    "      if (listeningText) listeningText.textContent = lang === 'es' ? 'Grabando... (haz clic en 🎤 para parar)' : lang === 'fr' ? 'Enregistrement... (cliquez 🎤 pour arrêter)' : 'Recording... (click 🎤 to stop)';"
)
rp(
    "        if (listeningText) listeningText.textContent = lang === 'fr' ? 'Transcription en cours...' : 'Transcribing...';",
    "        if (listeningText) listeningText.textContent = lang === 'es' ? 'Transcribiendo...' : lang === 'fr' ? 'Transcription en cours...' : 'Transcribing...';"
)

# Multiple "Écoute..." replacements — handle each occurrence
c = c.replace(
    "            if (listeningText) listeningText.textContent = lang === 'fr' ? 'Écoute...' : 'Listening...';\n            startVoiceInput",
    "            if (listeningText) listeningText.textContent = lang === 'es' ? 'Escuchando...' : lang === 'fr' ? 'Écoute...' : 'Listening...';\n            startVoiceInput"
)
rp(
    "            if (listeningText) listeningText.textContent = lang === 'fr' ? 'Envoi dans 2s...' : 'Sending in 2s...';",
    "            if (listeningText) listeningText.textContent = lang === 'es' ? 'Enviando en 2s...' : lang === 'fr' ? 'Envoi dans 2s...' : 'Sending in 2s...';"
)
rp(
    "              if (listeningText) listeningText.textContent = lang === 'fr' ? 'Écoute...' : 'Listening...';",
    "              if (listeningText) listeningText.textContent = lang === 'es' ? 'Escuchando...' : lang === 'fr' ? 'Écoute...' : 'Listening...';"
)
rp(
    "      alert(lang === 'fr' ? 'Accès au microphone refusé. Vérifiez les permissions.' : 'Microphone access denied. Please check your browser permissions.');",
    "      alert(lang === 'es' ? 'Acceso al micrófono denegado. Comprueba los permisos.' : lang === 'fr' ? 'Accès au microphone refusé. Vérifiez les permissions.' : 'Microphone access denied. Please check your browser permissions.');"
)
rp(
    "  if (listeningText) listeningText.textContent = lang === 'fr' ? 'Écoute...' : 'Listening...';\n  rec.lang = lang === 'fr' ? 'fr-FR' : 'en-US';",
    "  if (listeningText) listeningText.textContent = lang === 'es' ? 'Escuchando...' : lang === 'fr' ? 'Écoute...' : 'Listening...';\n  rec.lang = lang === 'es' ? 'es-ES' : lang === 'fr' ? 'fr-FR' : 'en-US';"
)
rp(
    "      if (listeningText) listeningText.textContent = lang === 'fr' ? 'Envoi dans 2s...' : 'Sending in 2s...';\n      setTimeout(() => {\n        if (listeningText) listeningText.textContent = lang === 'fr' ? 'Écoute...' : 'Listening...';",
    "      if (listeningText) listeningText.textContent = lang === 'es' ? 'Enviando en 2s...' : lang === 'fr' ? 'Envoi dans 2s...' : 'Sending in 2s...';\n      setTimeout(() => {\n        if (listeningText) listeningText.textContent = lang === 'es' ? 'Escuchando...' : lang === 'fr' ? 'Écoute...' : 'Listening...';"
)

# =============================================================
# 18. showUpgradePrompt + locked module text
# =============================================================
rp(
    "  const upgradeLabel = lang === 'fr' ? 'Voir les forfaits →' : 'See Plans →';",
    "  const upgradeLabel = lang === 'es' ? 'Ver planes →' : lang === 'fr' ? 'Voir les forfaits →' : 'See Plans →';"
)
rp(
    "  const lockedLabel  = lang === 'fr' ? `🔒 ${label} — Forfait payant requis` : `🔒 ${label} — Paid Plan Required`;",
    "  const lockedLabel  = lang === 'es' ? `🔒 ${label} — Plan de pago requerido` : lang === 'fr' ? `🔒 ${label} — Forfait payant requis` : `🔒 ${label} — Paid Plan Required`;"
)
rp(
    "    <div class=\"text-zinc-400 text-sm mb-5\">${lang==='fr'?'Passez à Premium ou à un forfait équipe pour accéder à tous les modules, scénarios, la voix, les certificats et plus encore.':'Upgrade to Premium or a Team Plan to unlock all modules, scenarios, voice roleplay, certificates and more.'}</div>",
    "    <div class=\"text-zinc-400 text-sm mb-5\">${lang==='es'?'Pasa a Premium o a un plan de equipo para desbloquear todos los módulos, escenarios, práctica vocal, certificados y más.':lang==='fr'?'Passez à Premium ou à un forfait équipe pour accéder à tous les modules, scénarios, la voix, les certificats et plus encore.':'Upgrade to Premium or a Team Plan to unlock all modules, scenarios, voice roleplay, certificates and more.'}</div>"
)
rp(
    "          html += showUpgradePrompt(lang === 'fr' ? '13 scénarios supplémentaires' : '13 more scenarios');",
    "          html += showUpgradePrompt(lang === 'es' ? '13 escenarios adicionales' : lang === 'fr' ? '13 scénarios supplémentaires' : '13 more scenarios');"
)

# =============================================================
# 19. renderScenarios tray labels
# =============================================================
rp(
    "  const trayLabel = lang === 'fr' ? 'Simulateur de plateau' : 'Tray Balance Simulator';",
    "  const trayLabel = lang === 'es' ? 'Simulador de Bandeja' : lang === 'fr' ? 'Simulateur de plateau' : 'Tray Balance Simulator';"
)
rp(
    "  const trayDesc  = lang === 'fr' ? 'Entraînez votre équilibre avec le simulateur de plateau gyroscopique. Inclinez votre appareil ou bougez la souris.' : 'Train your balance with the gyroscope tray simulator. Tilt your device or move your mouse.';",
    "  const trayDesc  = lang === 'es' ? 'Entrena tu equilibrio con el simulador de bandeja giroscópico. Inclina tu dispositivo o mueve el ratón.' : lang === 'fr' ? 'Entraînez votre équilibre avec le simulateur de plateau gyroscopique. Inclinez votre appareil ou bougez la souris.' : 'Train your balance with the gyroscope tray simulator. Tilt your device or move your mouse.';"
)
rp(
    "  const trayBtn   = lang === 'fr' ? 'Ouvrir le simulateur →' : 'Open Simulator →';",
    "  const trayBtn   = lang === 'es' ? 'Abrir simulador →' : lang === 'fr' ? 'Ouvrir le simulateur →' : 'Open Simulator →';"
)

# =============================================================
# 20. practiceTitle in renderScenarios
# =============================================================
rp(
    "  if (practiceTitle) practiceTitle.textContent = lang === 'fr'\n    ? 'Choisissez un scénario. Vous jouez le serveur — l\\'IA joue le client.'\n    : 'Choose a scenario. You play the server — the AI plays the guest.';",
    "  if (practiceTitle) practiceTitle.textContent = lang === 'es'\n    ? 'Elige un escenario. Tú juegas al mesero — la IA juega al cliente.'\n    : lang === 'fr'\n    ? 'Choisissez un scénario. Vous jouez le serveur — l\\'IA joue le client.'\n    : 'Choose a scenario. You play the server — the AI plays the guest.';"
)

# =============================================================
# 21. voice practice locked alert
# =============================================================
rp(
    "    alert(lang === 'fr'\n      ? '🔒 La pratique vocale est réservée aux membres payants. Visitez /pricing pour mettre à niveau.'\n      : '🔒 Voice practice requires a Premium or Team plan. Visit /pricing to upgrade.');",
    "    alert(lang === 'es'\n      ? '🔒 La práctica vocal requiere un plan Premium o de Equipo. Visita /pricing para actualizarte.'\n      : lang === 'fr'\n      ? '🔒 La pratique vocale est réservée aux membres payants. Visitez /pricing pour mettre à niveau.'\n      : '🔒 Voice practice requires a Premium or Team plan. Visit /pricing to upgrade.');"
)

# =============================================================
# 22. Chat connection/error messages
# =============================================================
rp(
    "    replaceLast(lang==='fr' ? 'Impossible de se connecter au serveur.' : 'Could not connect to server.');",
    "    replaceLast(lang==='es' ? 'No se pudo conectar al servidor.' : lang==='fr' ? 'Impossible de se connecter au serveur.' : 'Could not connect to server.');"
)
rp(
    "    replaceLastHtml(`<p class=\"text-red-400\">${lang==='fr'?'Erreur de connexion':'Connection error'}</p>`);",
    "    replaceLastHtml(`<p class=\"text-red-400\">${lang==='es'?'Error de conexión':lang==='fr'?'Erreur de connexion':'Connection error'}</p>`);"
)

# =============================================================
# 23. Summary/coaching UI text
# =============================================================
rp(
    "  const heading  = lang === 'fr' ? '📋 Bilan du formateur' : '📋 Trainer\\'s Verdict';",
    "  const heading  = lang === 'es' ? '📋 Veredicto del Entrenador' : lang === 'fr' ? '📋 Bilan du formateur' : '📋 Trainer\\'s Verdict';"
)
rp(
    "  const tryAgain = lang === 'fr' ? 'Essayer un autre scénario →' : 'Try another scenario →';",
    "  const tryAgain = lang === 'es' ? 'Probar otro escenario →' : lang === 'fr' ? 'Essayer un autre scénario →' : 'Try another scenario →';"
)
rp(
    "      ${lang === 'fr' ? 'Analyse en cours…' : 'Analysing your performance…'}",
    "      ${lang === 'es' ? 'Analizando tu desempeño…' : lang === 'fr' ? 'Analyse en cours…' : 'Analysing your performance…'}"
)
rp(
    "      : `<li class=\"text-zinc-500\">${lang === 'fr' ? 'Rien de notable.' : 'Nothing notable.'}</li>`;",
    "      : `<li class=\"text-zinc-500\">${lang === 'es' ? 'Nada destacable.' : lang === 'fr' ? 'Rien de notable.' : 'Nothing notable.'}</li>`;"
)
rp(
    "      : `<li class=\"text-zinc-500\">${lang === 'fr' ? 'Aucune erreur majeure.' : 'No major errors.'}</li>`;",
    "      : `<li class=\"text-zinc-500\">${lang === 'es' ? 'Sin errores importantes.' : lang === 'fr' ? 'Aucune erreur majeure.' : 'No major errors.'}</li>`;"
)
rp(
    "        <div class=\"text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2\">${lang === 'fr' ? 'Ce que vous avez bien fait' : 'What you did right'}</div>",
    "        <div class=\"text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2\">${lang === 'es' ? 'Lo que hiciste bien' : lang === 'fr' ? 'Ce que vous avez bien fait' : 'What you did right'}</div>"
)
rp(
    "        <div class=\"text-xs font-semibold uppercase tracking-wider text-red-400 mb-2\">${lang === 'fr' ? 'Ce qu\\'il faut améliorer' : 'What to improve'}</div>",
    "        <div class=\"text-xs font-semibold uppercase tracking-wider text-red-400 mb-2\">${lang === 'es' ? 'Qué mejorar' : lang === 'fr' ? 'Ce qu\\'il faut améliorer' : 'What to improve'}</div>"
)
rp(
    "        <span class=\"text-amber-400 font-semibold text-xs uppercase tracking-wider\">${lang === 'fr' ? '💡 Conseil pour la prochaine fois' : '💡 Tip for next time'}</span>",
    "        <span class=\"text-amber-400 font-semibold text-xs uppercase tracking-wider\">${lang === 'es' ? '💡 Consejo para la próxima vez' : lang === 'fr' ? '💡 Conseil pour la prochaine fois' : '💡 Tip for next time'}</span>"
)
rp(
    "      : `<p class=\"text-zinc-400 text-sm\">${lang === 'fr' ? 'Impossible de charger l\\'analyse.' : 'Could not load detailed analysis.'}</p>`;",
    "      : `<p class=\"text-zinc-400 text-sm\">${lang === 'es' ? 'No se pudo cargar el análisis.' : lang === 'fr' ? 'Impossible de charger l\\'analyse.' : 'Could not load detailed analysis.'}</p>`;"
)

# =============================================================
# 24. Glossary — renderGlossary + term/def lookup
# =============================================================
rp(
    "    const term = lang === 'fr' ? t.termFr : t.term;",
    "    const term = lang === 'es' && t.termEs ? t.termEs : lang === 'fr' ? t.termFr : t.term;"
)
rp(
    "    const def  = lang === 'fr' ? t.defFr  : t.def;",
    "    const def  = lang === 'es' && t.defEs  ? t.defEs  : lang === 'fr' ? t.defFr  : t.def;"
)
rp(
    "  if (heading) heading.textContent = lang === 'fr' ? 'Glossaire de l\\'hôtellerie' : 'Hospitality Glossary';",
    "  if (heading) heading.textContent = lang === 'es' ? 'Glosario de Hostelería' : lang === 'fr' ? 'Glossaire de l\\'hôtellerie' : 'Hospitality Glossary';"
)
rp(
    "  if (sub) sub.textContent = lang === 'fr' ? '25 termes essentiels que tout serveur devrait connaître' : '25 essential terms every server should know';",
    "  if (sub) sub.textContent = lang === 'es' ? '25 términos esenciales que todo mesero debe conocer' : lang === 'fr' ? '25 termes essentiels que tout serveur devrait connaître' : '25 essential terms every server should know';"
)

print("All structural/code changes applied.")
print(f"Final file size: {len(c)} chars")

with open('app.html', 'w', encoding='utf-8') as f:
    f.write(c)

print("File written successfully.")
