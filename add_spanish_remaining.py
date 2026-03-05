#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys

with open('app.html', 'r', encoding='utf-8') as f:
    c = f.read()

count = [0]
def rp(old, new, desc=''):
    global c
    if old not in c:
        print(f"MISS ({desc}): {old[:60]!r}", file=sys.stderr)
        return
    c = c.replace(old, new, 1)
    count[0] += 1

def add_title(titleFr, titleEs):
    old = f'titleFr:"{titleFr}", body:'
    new = f'titleFr:"{titleFr}", titleEs:"{titleEs}", body:'
    rp(old, new, f'title: {titleEs}')

# =====================================================
# MODULE 3 remaining lesson titles
# =====================================================
add_title("Service de la bière & connaissances", "Servicio de Cerveza y Conocimiento")
add_title("Spiritueux, digestifs & boissons après dîner", "Destilados, Digestivos y Bebidas Post-Cena")
add_title("Service des boissons chaudes", "Servicio de Bebidas Calientes")
add_title("Techniques de vente additionnelle de boissons", "Técnicas de Venta Sugestiva de Bebidas")
add_title("Service responsable de l'alcool", "Servicio Responsable de Alcohol")
add_title("Service de l'eau & vente additionnelle d'eau en bouteille", "Servicio de Agua y Venta de Agua Embotellada")

# =====================================================
# MODULE 4 remaining lesson titles
# =====================================================
add_title("Les bases des accords", "Las Bases del Maridaje")
add_title("Fondamentaux des vins rouges", "Fundamentos de los Vinos Tintos")
add_title("Fondamentaux des vins blancs", "Fundamentos de los Vinos Blancos")
add_title("Guider les clients sur la carte des vins", "Guiar a los Clientes por la Carta de Vinos")
add_title("Vins effervescents & Champagne", "Vinos Espumosos y Champagne")
add_title("Vins rosés & orange", "Vinos Rosados y Naranja")
add_title("Vins de dessert & vins fortifiés", "Vinos de Postre y Vinos Fortificados")
add_title("Accord fromage & vin", "Maridaje Queso y Vino")
add_title("Traditions régionales d'accords", "Tradiciones Regionales de Maridaje")
add_title("Communiquer les accords aux clients", "Comunicar los Maridajes a los Clientes")

# =====================================================
# MODULE 5 remaining lesson titles
# =====================================================
add_title("Le bon état d'esprit pour la vente additionnelle", "La Mentalidad Correcta para la Venta Sugestiva")
add_title("Techniques de vente suggestive", "Técnicas de Venta Sugestiva")
add_title("Bien chronométrer vos suggestions", "El Momento Oportuno para tus Sugerencias")
add_title("Lire la table", "Leer la Mesa")
add_title("Vente additionnelle d'eaux premium & boissons", "Venta Sugestiva de Aguas Premium y Bebidas")
add_title("Digestifs & expériences après dîner", "Digestivos y Experiencias Post-Cena")

# =====================================================
# MODULE 6 remaining lesson titles
# =====================================================
add_title("Service correct des plats", "Servicio Correcto de los Platos")
add_title("Le rythme du repas", "El Ritmo de la Comida")
add_title("Coordination avec la cuisine", "Coordinación con la Cocina")
add_title("Porter les assiettes professionnellement", "Llevar Platos Profesionalmente")
add_title("L'art d'annoncer les plats", "El Arte de Anunciar los Platos")
add_title("Débarrasser les assiettes correctement", "Retirar los Platos Correctamente")
add_title("Brosser la table", "Cepillar la Mesa")
add_title("Gérer une section complète", "Gestionar una Sección Completa")

# =====================================================
# MODULE 7 remaining lesson titles
# =====================================================
add_title("Gérer une affluence sans paniquer", "Gestionar la Aglomeración sin Pánico")
add_title("Remise à zéro en fin de service", "Reinicio al Final del Servicio")
add_title("Entretien proactif des tables", "Mantenimiento Proactivo de las Mesas")
add_title("Le contrôle de satisfaction", "El Control de Satisfacción")
add_title("Gérer les plaintes avec grâce", "Gestionar las Quejas con Elegancia")
add_title("Techniques de récupération", "Técnicas de Recuperación")
add_title("Standards du linge & des serviettes", "Estándares de Ropa de Mesa y Servilletas")
add_title("Standards de l'argenterie & des couverts", "Estándares de la Cubertería y Vajilla")
add_title("Quand escalader vers la direction", "Cuándo Escalar a la Dirección")
add_title("Prévenir les problèmes proactivement", "Prevenir los Problemas Proactivamente")
add_title("Gérer un conflit avec un collègue en salle", "Gestionar un Conflicto con un Colega en Sala")
add_title("Suivi après plainte", "Seguimiento Tras una Queja")

# =====================================================
# MODULE 8 remaining lesson titles
# =====================================================
add_title("Bases de la sensibilisation culturelle", "Bases de la Conciencia Cultural")
add_title("Exigences alimentaires et religieuses", "Requisitos Alimentarios y Religiosos")
add_title("Barrières linguistiques", "Barreras del Idioma")
add_title("Service des VIP et dignitaires", "Servicio a VIP y Dignatarios")
add_title("Coutumes de restauration d'Asie de l'Est", "Costumbres de Restauración de Asia Oriental")
add_title("Coutumes du Moyen-Orient & d'Asie du Sud", "Costumbres de Medio Oriente y Asia del Sur")
add_title("Variations de service européen", "Variaciones del Servicio Europeo")
add_title("La culture du pourboire à travers le monde", "La Cultura de la Propina en el Mundo")
add_title("Sensibilité au vin & à l'alcool à travers les cultures", "Sensibilidad al Vino y el Alcohol entre Culturas")
add_title("Inclusion & accessibilité", "Inclusión y Accesibilidad")

# =====================================================
# MODULE 9 remaining lesson titles
# =====================================================
add_title("Identifier les occasions spéciales", "Identificar las Ocasiones Especiales")
add_title("L'expérience d'anniversaire", "La Experiencia del Cumpleaños")
add_title("Anniversaires de mariage & demandes en mariage", "Aniversarios y Propuestas de Matrimonio")
add_title("Célébrations de groupe", "Celebraciones de Grupo")
add_title("Dîners d'entreprise & d'affaires", "Cenas Corporativas y de Negocios")
add_title("Événements de menu dégustation", "Eventos de Menú Degustación")
add_title("Dîners de répétition & événements pré-mariage", "Cenas de Ensayo y Eventos Pre-Boda")
add_title("Préparation du service des fêtes", "Preparación del Servicio en Festividades")
add_title("Table du chef & salle de restaurant privée", "Mesa del Chef y Sala de Restaurante Privada")
add_title("Intelligence émotionnelle dans le service", "Inteligencia Emocional en el Servicio")

# =====================================================
# MODULE 10 remaining lesson titles
# =====================================================
add_title("Le moment du dessert", "El Momento del Postre")
add_title("Présenter la note", "Presentar la Cuenta")
add_title("Les adieux", "La Despedida")
add_title("Rituels après service", "Rituales Tras el Servicio")
add_title("Excellence du service café & thé", "Excelencia en el Servicio de Café y Té")
add_title("Digestifs & derniers verres", "Digestivos y Últimas Copas")
add_title("Gérer la note avec soin", "Gestionar la Cuenta con Cuidado")
add_title("Gérer les notes divisées", "Gestionar las Cuentas Divididas")
add_title("Objets perdus & suivi", "Objetos Perdidos y Seguimiento")
add_title("Encourager les avis & les visites de retour", "Fomentar las Reseñas y las Visitas de Regreso")

# =====================================================
# MODULE 11 remaining lesson titles
# =====================================================
add_title("La France : la référence", "Francia: La Referencia Mundial")
add_title("L'Italie : diversité & complexité", "Italia: Diversidad y Complejidad")
add_title("Points forts du Nouveau Monde", "Puntos Destacados del Nuevo Mundo")
add_title("Espagne & Allemagne", "España y Alemania")
add_title("Canada : Vin de glace & plus encore", "Canadá: Vino de Hielo y Más")
add_title("Le Portugal : la perle cachée", "Portugal: La Perla Escondida")
add_title("Australie & Nouvelle-Zélande", "Australia y Nueva Zelanda")

# =====================================================
# MODULE 12 remaining lesson titles
# =====================================================
add_title("Mentorer le personnel junior", "Mentorear al Personal Junior")
add_title("Animer un briefing pré-service", "Dirigir un Briefing Pre-Servicio")
add_title("Gérer vos finances", "Gestionar tus Finanzas")
add_title("Parcours de carrière", "Trayectoria Profesional")
add_title("Montrer l'exemple", "Dar el Ejemplo")
add_title("Résolution de conflits en salle", "Resolución de Conflictos en Sala")
add_title("Former le nouveau personnel efficacement", "Formar al Nuevo Personal Eficazmente")
add_title("Construire votre réputation professionnelle", "Construir tu Reputación Profesional")
add_title("Le parcours du sommelier", "El Camino del Sumiller")

# =====================================================
# FIX the 3 warnings from the infrastructure script
# =====================================================
# Fix week_warrior badge (check exact text)
rp(
    "{ id:'week_warrior', icon:'🔥', name:'Week Warrior', nameFr:'Guerrier de la semaine',",
    "{ id:'week_warrior', icon:'🔥', name:'Week Warrior', nameFr:'Guerrier de la semaine', nameEs:'Guerrero Semanal',",
    'week_warrior badge name'
)
rp(
    "descFr:\"Série de 7 jours d'apprentissage\" },",
    "descFr:\"Série de 7 jours d'apprentissage\", descEs:'Racha de aprendizaje de 7 días' },",
    'week_warrior badge desc'
)

# Fix remaining listening text occurrences
# Check for any remaining fr-only listening texts
rp(
    "listeningText.textContent = lang === 'fr' ? 'Écoute...' : 'Listening...';\n",
    "listeningText.textContent = lang === 'es' ? 'Escuchando...' : lang === 'fr' ? 'Écoute...' : 'Listening...';\n",
    'listening text fix'
)
rp(
    "listeningText.textContent = lang === 'fr' ? 'Envoi dans 2s...' : 'Sending in 2s...';\n",
    "listeningText.textContent = lang === 'es' ? 'Enviando en 2s...' : lang === 'fr' ? 'Envoi dans 2s...' : 'Sending in 2s...';\n",
    'sending text fix'
)

# =====================================================
# MODULE 3 QUIZ — need actual French question text
# =====================================================
def quiz_q(qFr, qEs, optsFr_str, optsEs_list):
    # Add qEs
    old_q = f'qFr:"{qFr}"'
    new_q = f'qFr:"{qFr}", qEs:"{qEs}"'
    rp(old_q, new_q, f'q: {qEs[:30]}')
    # Add optionsEs
    opts_es = str(optsEs_list).replace("'", '"')
    old_opts = f'optionsFr:{optsFr_str}, answer:'
    new_opts = f'optionsFr:{optsFr_str}, optionsEs:{opts_es}, answer:'
    rp(old_opts, new_opts, f'opts: {qEs[:30]}')

# Read actual quiz questions from file for mod 3
# Using grep to find them — just use partial qFr matches
rp(
    'qFr:"Quelle est la procédure correcte pour servir le vin?", options:',
    'qFr:"Quelle est la procédure correcte pour servir le vin?", qEs:"¿Cuál es el procedimiento correcto para servir el vino?", options:',
    'mod3 q1'
)
rp(
    'qFr:"Quelle est la procédure correcte pour servir le vin?", qEs:"¿Cuál es el procedimiento correcto para servir el vino?", options:["Close',
    'qFr:"Quelle est la procédure correcte pour servir le vin?", qEs:"¿Cuál es el procedimiento correcto para servir el vino?", options:["Close',
    'noop'
)

print(f"Applied {count[0]} additional changes.")

with open('app.html', 'w', encoding='utf-8') as f:
    f.write(c)
print("File written.")
