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

# ======================================================
# MODULE SUBTITLES
# ======================================================
rp(
    'subtitle: "The mindset and habits that separate great servers from average ones.",\n    subtitleFr: "L\'état d\'esprit et les habitudes qui distinguent les grands serveurs.",',
    'subtitle: "The mindset and habits that separate great servers from average ones.",\n    subtitleFr: "L\'état d\'esprit et les habitudes qui distinguent les grands serveurs.",\n    subtitleEs: "La mentalidad y los hábitos que distinguen a los grandes meseros.",',
    'mod1 subtitle'
)
rp(
    'subtitleFr:"Guidez les clients de l\'arrivée à la commande avec confiance et précision.",',
    'subtitleFr:"Guidez les clients de l\'arrivée à la commande avec confiance et précision.", subtitleEs:"Guía a los clientes desde la llegada hasta el pedido con confianza y precisión.",',
    'mod2 subtitle'
)
rp(
    'subtitleFr:"Maîtrisez la présentation du vin, le service des cocktails et la vente additionnelle de boissons.",',
    'subtitleFr:"Maîtrisez la présentation du vin, le service des cocktails et la vente additionnelle de boissons.", subtitleEs:"Domina la presentación del vino, el servicio de cócteles y la venta sugestiva de bebidas.",',
    'mod3 subtitle'
)
rp(
    'subtitleFr:"Associez les vins aux plats et guidez les clients à travers la carte des vins.",',
    'subtitleFr:"Associez les vins aux plats et guidez les clients à travers la carte des vins.", subtitleEs:"Combina vinos con platos y guía a los clientes a través de la carta de vinos.",',
    'mod4 subtitle'
)
rp(
    'subtitleFr:"Augmentez les revenus naturellement tout en améliorant l\'expérience client.",',
    'subtitleFr:"Augmentez les revenus naturellement tout en améliorant l\'expérience client.", subtitleEs:"Aumenta los ingresos de forma natural mientras mejoras la experiencia del cliente.",',
    'mod5 subtitle'
)
rp(
    'subtitleFr:"Servez les plats correctement et maintenez le repas au rythme parfait.",',
    'subtitleFr:"Servez les plats correctement et maintenez le repas au rythme parfait.", subtitleEs:"Sirve los platos correctamente y mantén el ritmo perfecto del servicio.",',
    'mod6 subtitle'
)
rp(
    'subtitleFr:"Gardez les tables impeccables et résolvez les problèmes avant qu\'ils n\'escaladent.",',
    'subtitleFr:"Gardez les tables impeccables et résolvez les problèmes avant qu\'ils n\'escaladent.", subtitleEs:"Mantén las mesas impecables y resuelve los problemas antes de que escalen.",',
    'mod7 subtitle'
)
rp(
    'subtitleFr:"Servez des clients de toutes cultures avec sensibilisation et respect.",',
    'subtitleFr:"Servez des clients de toutes cultures avec sensibilisation et respect.", subtitleEs:"Atiende a clientes de todas las culturas con sensibilidad y respeto.",',
    'mod8 subtitle'
)
rp(
    'subtitleFr:"Créez des moments inoubliables pour les anniversaires, les noces et les célébrations.",',
    'subtitleFr:"Créez des moments inoubliables pour les anniversaires, les noces et les célébrations.", subtitleEs:"Crea momentos inolvidables para cumpleaños, bodas y celebraciones.",',
    'mod9 subtitle'
)
rp(
    'subtitleFr:"Terminez chaque repas sur une note haute et maximisez les visites de retour.",',
    'subtitleFr:"Terminez chaque repas sur une note haute et maximisez les visites de retour.", subtitleEs:"Termina cada comida en un punto alto y maximiza las visitas de retorno.",',
    'mod10 subtitle'
)
rp(
    'subtitleFr:"Naviguez dans les grandes régions viticoles du monde et recommandez avec autorité.",',
    'subtitleFr:"Naviguez dans les grandes régions viticoles du monde et recommandez avec autorité.", subtitleEs:"Navega por las grandes regiones vinícolas del mundo y recomienda con autoridad.",',
    'mod11 subtitle'
)
rp(
    'subtitleFr:"Adoptez un rôle de leadership et construisez une carrière à long terme dans l\'hôtellerie.",',
    'subtitleFr:"Adoptez un rôle de leadership et construisez une carrière à long terme dans l\'hôtellerie.", subtitleEs:"Adopta un rol de liderazgo y construye una carrera a largo plazo en hostelería.",',
    'mod12 subtitle'
)

# ======================================================
# MODULE 1 LESSONS — titleEs + bodyEs
# ======================================================
def lesson(titleFr, titleEs, bodyFr_snippet, bodyEs):
    old = f'titleFr:"{titleFr}"'
    new = f'titleFr:"{titleFr}", titleEs:"{titleEs}"'
    rp(old, new, f'title: {titleEs}')

    # Add bodyEs after bodyFr
    marker = bodyFr_snippet + '" },'
    replacement = bodyFr_snippet + f'", bodyEs:"{bodyEs}" }},'
    rp(marker, replacement, f'body: {titleEs}')

lesson(
    "L'état d'esprit du serveur",
    "La Mentalidad del Mesero",
    "l'hospitalité : chaque client mérite de se sentir unique. Apprenez à lire le langage corporel, anticiper les besoins et projeter de la confiance sans arrogance.",
    "El servicio excepcional comienza antes de pisar el salón. Adopta una mentalidad centrada en la hospitalidad: cada cliente merece sentirse como la única persona en el lugar. Aprende a leer el lenguaje corporal, anticipar necesidades y proyectar confianza sin arrogancia."
)
lesson(
    "Premières impressions",
    "Las Primeras Impresiones",
    "Approchez la table dans les 2 minutes après l'installation — tout retard signale de la négligence.",
    "Tienes 7 segundos para causar una primera impresión. Una sonrisa cálida, contacto visual y un saludo genuino marcan el tono. Acércate a la mesa en los primeros 2 minutos tras la llegada — el retraso transmite descuido."
)
lesson(
    "La règle des 3 pieds",
    "La Regla de los 3 Pies",
    "Ne passez jamais devant un client qui cherche de l'aide.",
    "Todo cliente a menos de 1 metro merece reconocimiento. Un simple gesto de cabeza o 'En un momento estoy con usted' evita la frustración. Nunca pases frente a un cliente que busca ayuda."
)
lesson(
    "Professionnalisme sous pression",
    "Profesionalismo bajo Presión",
    "Les clients respectent bien plus l'honnêteté que les fausses promesses.",
    "Los turnos ocupados pondrán a prueba tu carácter. Desarrolla una rutina de reenfoque mental: respira, prioriza y comunica los retrasos honestamente. Los clientes respetan la honestidad mucho más que las falsas promesas."
)
lesson(
    "Présentation personnelle & tenue",
    "Presentación Personal y Aseo",
    "Les clients remarquent les détails avant même que vous parliez.",
    "Tu apariencia es una extensión directa de la marca del restaurante. Un uniforme limpio y planchado, cabello ordenado, uñas recortadas y fragancia neutra (o ninguna) transmiten profesionalismo. Los clientes notan los detalles antes de que abras la boca."
)
lesson(
    "Anticiper les besoins des clients",
    "Anticipar las Necesidades del Cliente",
    "L'anticipation transforme un bon service en service mémorable.",
    "Los mejores meseros resuelven los problemas antes de que los clientes los mencionen. Observa un vaso de agua casi vacío, un niño sin silla alta o una pareja estudiando el menú de postres — y actúa. La anticipación convierte el buen servicio en servicio memorable."
)
lesson(
    "Compétences d'écoute active",
    "Habilidades de Escucha Activa",
    "L'écoute est le fondement de la précision et de la confiance.",
    "Cuando un cliente habla, detente y escucha plenamente. No interrumpas, no planifiques tu respuesta mientras habla. Repite los detalles clave — 'Entonces es el salmón a punto sin salsa aparte.' La escucha es la base de la precisión y la confianza."
)
lesson(
    "Techniques de mémorisation pour serveurs",
    "Técnicas de Memorización para Meseros",
    "Une bonne mémoire protège la précision et impressionne les clients.",
    "Desarrolla un sistema para memorizar pedidos: usa posiciones de asientos (el asiento 1 siempre es el más cercano a la puerta), dibuja un esquema rápido de la mesa y usa abreviaciones. Para los especiales, repítelos tres veces antes de ir a la mesa. Una buena memoria protege la precisión e impresiona a los clientes."
)
lesson(
    "Gérer plusieurs tables simultanément",
    "Gestionar Múltiples Mesas",
    "Ne laissez jamais une table accaparer toute votre attention.",
    "Prioriza por urgencia: una mesa recién sentada necesita reconocimiento, una mesa esperando la cuenta necesita acción, una mesa en medio de la comida necesita un control discreto. Construye una rotación mental y cúmplela. Nunca permitas que una mesa acapare toda tu atención."
)
lesson(
    "Prendre soin de soi & durabilité dans l'hôtellerie",
    "Autocuidado y Sostenibilidad en Hostelería",
    "votre longévité dans cette carrière dépend de vous traiter comme un athlète professionnel.",
    "La hostelería es exigente física y emocionalmente. Usa calzado con soporte, come antes de tu turno, mantente hidratado y desarrolla una rutina de descompresión post-servicio. Un mesero agotado no sirve bien a nadie. Tu longevidad en esta carrera depende de tratarte como un atleta profesional."
)

# ======================================================
# MODULE 1 QUIZ
# ======================================================
def quiz_q(qFr_snippet, qEs, optsFr_snippet, optsEs_list):
    # Add qEs after qFr
    marker = f'qFr:"{qFr_snippet}"'
    rp(marker, f'qFr:"{qFr_snippet}", qEs:"{qEs}"', f'qEs: {qEs[:30]}')
    # Add optionsEs
    opts_es = str(optsEs_list).replace("'", '"')
    marker2 = f'optionsFr:{optsFr_snippet}, answer:'
    rp(marker2, f'optionsFr:{optsFr_snippet}, optionsEs:{opts_es}, answer:', f'optsEs: {qEs[:30]}')

quiz_q(
    "Dans quel délai devez-vous approcher une table nouvellement installée?",
    "¿En cuánto tiempo debe acercarse a una mesa recién sentada?",
    '["Dans les 2 minutes","Quand ils font signe","Après 5 minutes","Après avoir pris une autre commande"]',
    ["En 2 minutos","Cuando hacen señas","Después de 5 minutos","Después de tomar otro pedido"]
)
quiz_q(
    "Que signifie la règle des 3 pieds?",
    "¿Qué significa la regla de los 3 pies?",
    '["Garder 3 pieds des tables","Reconnaître tout client à moins d\'un mètre","Porter les plateaux à 3 pieds de hauteur","Espacer les tables de 3 pieds"]',
    ["Mantener 3 pies de distancia de las mesas","Reconocer a todo cliente a menos de 1 metro","Cargar bandejas a 3 pies de altura","Separar las mesas 3 pies"]
)
quiz_q(
    "Quand un client parle, vous devez:",
    "Cuando un cliente habla, debes:",
    '["Planifier votre réponse immédiatement","Interrompre pour montrer l\'efficacité","Vous arrêter et écouter pleinement","Continuer vos tâches en écoutant"]',
    ["Planificar tu respuesta inmediatamente","Interrumpir para mostrar eficiencia","Detenerte y escuchar plenamente","Continuar tus tareas mientras escuchas"]
)
quiz_q(
    "Lequel des éléments suivants est la norme de présentation la plus importante pour les serveurs?",
    "¿Cuál es la norma de presentación más importante para los meseros?",
    '["Porter un parfum fort","Uniforme propre et repassé, parfum neutre","Porter des bijoux","Coiffer les cheveux de manière élaborée"]',
    ["Usar perfume fuerte","Uniforme limpio y planchado, fragancia neutra","Usar joyería","Peinarse elaboradamente"]
)
quiz_q(
    "Anticiper les besoins des clients signifie:",
    "Anticipar las necesidades del cliente significa:",
    '["Attendre que les clients demandent","Agir sur les besoins avant que les clients ne les expriment","Vérifier toutes les 5 minutes","Proposer la note tôt"]',
    ["Esperar a que los clientes pidan","Actuar sobre las necesidades antes de que el cliente las exprese","Revisar cada 5 minutos","Ofrecer la cuenta antes de tiempo"]
)

# ======================================================
# MODULE 2 LESSONS
# ======================================================
lesson(
    "Placer les clients correctement",
    "Sentar a los Clientes Correctamente",
    "Présentez les menus ouverts à la première page, en commençant par l'hôte ou l'invité d'honneur.",
    "Siempre conduce a los clientes a su mesa, nunca señales. Retira las sillas cuando sea apropiado. Presenta los menús abiertos en la primera página, comenzando por el anfitrión o el invitado de honor."
)
lesson(
    "Connaissance du menu",
    "Conocimiento del Menú",
    "Si vous ne savez pas, dites-le et renseignez-vous immédiatement — ne devinez jamais.",
    "Conoce tu menú de punta a punta: cada ingrediente, alérgeno y método de preparación. Está listo para describir cualquier plato con entusiasmo. Si no sabes algo, dilo y averígualo de inmediato — nunca adivines."
)
lesson(
    "Prendre les commandes efficacement",
    "Tomar Pedidos Eficientemente",
    "Répétez la commande pour confirmer l'exactitude.",
    "Comienza con las bebidas para dar tiempo a los clientes con el menú de comida. Escribe los pedidos claramente — nunca dependas únicamente de la memoria para una mesa completa. Repite el pedido para confirmar la precisión."
)
lesson(
    "Gestion des restrictions alimentaires",
    "Manejo de Restricciones Alimentarias",
    "Des formules comme 'Absolument, laissez-moi vérifier avec le chef' renforcent la confiance.",
    "Toma las alergias en serio — siempre confirma con la cocina. Sugiere alternativas sin hacer que los clientes se sientan una carga. Frases como 'Por supuesto, déjame verificar con el chef' generan confianza."
)
lesson(
    "L'art de décrire les plats",
    "El Arte de Describir los Platos",
    "Choisissez trois descripteurs vivants par plat et pratiquez-les avant le service.",
    "Usa lenguaje sensorial para crear una imagen: textura, temperatura, origen y método de preparación. 'Una costilla corta braseada lentamente, tierna, terminada con jugo de vino tinto y tuétano asado' vende mucho mejor el plato que 'la carne'. Elige tres descriptores vívidos por plato y practícalos antes del servicio."
)
lesson(
    "Présenter et décrire les spéciaux du jour",
    "Presentar y Describir los Especiales del Día",
    "L'enthousiasme est contagieux.",
    "Los especiales deben memorizarse, no leerse de un cuaderno — leerlos parece ensayado e impersonal. Incluye la proteína, la preparación, los acompañamientos y el precio. Recomienda dos de tus favoritos personales: 'El chef está particularmente emocionado con el halibut esta noche.' El entusiasmo es contagioso."
)
lesson(
    "Guider un client indécis",
    "Guiar a un Cliente Indeciso",
    "Deux questions suffisent pour les guider vers une décision qu'ils sentent comme la leur.",
    "Cuando un cliente está abrumado, reduce sus opciones. Haz dos preguntas específicas: '¿Prefieres carne roja o algo más ligero esta noche?' luego '¿Prefieres sabores intensos o algo más delicado?' Dos preguntas bastan para guiarlos hacia una decisión que sientan como propia."
)
lesson(
    "Prise de commande & abréviations",
    "Escritura de Pedidos y Abreviaciones",
    "Des commandes écrites précises sont la colonne vertébrale d'un service fluide.",
    "Desarrolla un sistema de abreviaciones confiable: M=término medio, PR=poco rojo, SM=sin mantequilla, SG=sin gluten. Usa una numeración consistente de asientos para que los corredores puedan entregar sin preguntar quién pidió qué. Los pedidos escritos precisos son la columna vertebral de un servicio fluido."
)
lesson(
    "Relire et confirmer les commandes",
    "Relectura y Confirmación de Pedidos",
    "ne griffonnez jamais sur vos notes.",
    "Siempre lee el pedido completo antes de dejar la mesa. Esto detecta errores antes de que lleguen a la cocina y señala atención. Si un cliente cambia algo, tacha claramente y reescribe — nunca borronees tus notas."
)
lesson(
    "Gérer le calendrier des commandes",
    "Gestionar el Tiempo de los Pedidos",
    "vous devriez l'attendre, pas le courir après.",
    "Después de colocar un pedido, da a la cocina un recuento preciso de comensales y cualquier solicitud de tiempo. Para grupos grandes, escala los platos deliberadamente. Sigue mentalmente la etapa de pedido de cada mesa para nunca sorprenderte cuando llega un plato — deberías esperarlo, no buscarlo."
)

# MODULE 2 QUIZ
quiz_q(
    "Lors de la présentation des menus, vous devez les présenter:",
    "Al presentar los menús, debes presentarlos:",
    '["Fermés face vers le bas","Ouverts à la première page","Au plus jeune client d\'abord","Aux adultes seulement"]',
    ["Cerrados boca abajo","Abiertos en la primera página","Al cliente más joven primero","Solo a los adultos"]
)
quiz_q(
    "Quand devez-vous prendre les commandes de boissons?",
    "¿Cuándo debes tomar los pedidos de bebidas?",
    '["Après les commandes de plats","Avant les commandes de plats","En même temps que les plats","Seulement si demandé"]',
    ["Después de los pedidos de comida","Antes de los pedidos de comida","Al mismo tiempo que la comida","Solo si se solicita"]
)
quiz_q(
    "Si vous ne connaissez pas la réponse à la question d'un client sur un plat, vous devez:",
    "Si no conoces la respuesta a la pregunta de un cliente sobre un plato, debes:",
    '["Faire de votre mieux","Dire que vous ne savez pas et vous renseigner immédiatement","Rediriger vers un autre plat","Leur dire de demander directement au chef"]',
    ["Hacer tu mejor suposición","Decir que no sabes e informarte de inmediato","Redirigir a otro plato","Decirles que pregunten directamente al chef"]
)
quiz_q(
    "Pour guider un client indécis, la meilleure approche est:",
    "Para guiar a un cliente indeciso, el mejor enfoque es:",
    '["Lire tout le menu à voix haute","Poser deux questions ciblées pour réduire les choix","Leur dire quoi commander","Les laisser seuls jusqu\'à ce qu\'ils décident"]',
    ["Leer todo el menú en voz alta","Hacer dos preguntas específicas para reducir las opciones","Decirles qué pedir","Dejarlos solos hasta que decidan"]
)
quiz_q(
    "Les spéciaux doivent être présentés:",
    "Los especiales deben presentarse:",
    '["Lus sur un carnet","Mémorisés et livrés avec enthousiasme","Seulement si les clients le demandent","Après le menu principal"]',
    ["Leídos de un cuaderno","Memorizados y presentados con entusiasmo","Solo si los clientes lo solicitan","Después del menú principal"]
)

# ======================================================
# MODULE 3 — Beverage lessons (adding titleEs + bodyEs via bodyFr snippet)
# ======================================================
lesson(
    "Présentation du vin",
    "Presentación del Vino",
    "Versez une petite dégustation pour l'hôte avant de servir les autres dans le sens des aiguilles d'une montre.",
    "Presenta la etiqueta de la botella frente al anfitrión antes de abrir. Corta el papel de aluminio limpiamente, inserta el sacacorchos y retira el corcho en un movimiento fluido. Sirve una pequeña degustación para que el anfitrión apruebe antes de servir a los demás en el sentido de las agujas del reloj."
)
lesson(
    "Connaissance des cocktails",
    "Conocimiento de Cócteles",
    "Soyez prêt à suggérer des cocktails basés sur les préférences exprimées par le client.",
    "Conoce los cócteles signature de tu bar y los clásicos estándar. Entiende la diferencia entre agitado y revuelto, y cuándo usar cada uno. Está listo para sugerir cócteles basados en las preferencias expresadas por el cliente."
)
lesson(
    "Options sans alcool",
    "Opciones Sin Alcohol",
    "Demandez 'Préférez-vous quelque chose avec ou sans alcool ce soir?'",
    "Nunca descuides a los clientes que no consumen alcohol. Presenta los mocktails y opciones sin alcohol premium con el mismo entusiasmo que los cócteles. Pregunta: '¿Prefieres algo con o sin alcohol esta noche?'"
)
lesson(
    "Service approprié de la verrerie",
    "Servicio Apropiado de la Cristalería",
    "Remplissez les verres d'eau de façon proactive tout au long du repas.",
    "Siempre maneja la cristalería por el tallo (vino) o la base (cerveza). Nunca dejes que los dedos toquen el cáliz. Coloca los vasos suavemente — sin ruidos. Rellena los vasos de agua de forma proactiva durante toda la comida."
)
lesson(
    "Techniques d'upselling des boissons",
    "Técnicas de Venta Sugestiva de Bebidas",
    "L'upselling de boissons est l'une des compétences les plus rentables qu'un serveur puisse maîtriser.",
    "La venta sugestiva de bebidas es una de las habilidades más rentables que un mesero puede dominar. Sugiere una segunda botella cuando quede aproximadamente un tercio. Para los cócteles, ofrece un segundo diciendo: '¿Te traigo otro?'. Conoce los márgenes de tu bar — las bebidas premium son beneficiosas para todos."
)
lesson(
    "Maîtrise des spiritueux",
    "Dominio de los Destilados",
    "Un serveur qui maîtrise les spiritueux est un atout inestimable.",
    "Familiarízate con los destilados principales: whisky, ginebra, ron, tequila, vodka y cognac. Conoce las categorías premium dentro de cada uno. Un mesero que domina los destilados es un activo invaluable en cualquier barra de alta gama."
)
lesson(
    "La règle d'or du service des boissons",
    "La Regla de Oro del Servicio de Bebidas",
    "Un verre vide est une opportunité manquée et un signal de service médiocre.",
    "Un vaso vacío es una oportunidad perdida y una señal de servicio deficiente. Establece un estándar personal: nunca dejar que un vaso de agua esté completamente vacío y siempre ofrecer proactivamente la siguiente bebida antes de que la pidan."
)
lesson(
    "Connaissance de la bière artisanale",
    "Conocimiento de Cerveza Artesanal",
    "La bière artisanale connaît une renaissance mondiale.",
    "La cerveza artesanal vive un renacimiento mundial. Conoce los estilos principales: IPA, stout, lager, pilsner, pale ale y saison. Entiende el perfil de sabor de cada uno y cuándo recomendarlos. Igualar la cerveza con los platos del menú es una habilidad que impresiona a los clientes."
)
lesson(
    "Cocktails signature & menu des boissons",
    "Cócteles Signature y Menú de Bebidas",
    "Connaître l'histoire et les ingrédients derrière chaque cocktail signature permet de le vendre efficacement.",
    "Conoce la historia y los ingredientes detrás de cada cóctel signature te permite venderlo efectivamente. Practica describir cada uno con dos o tres palabras evocadoras. 'Nuestro Old Fashioned con bourbon ahumado y bitter de naranja' pinta una imagen mucho más vívida que simplemente 'un Old Fashioned'."
)
lesson(
    "Gestion des situations liées à l'alcool",
    "Gestión de Situaciones Relacionadas con el Alcohol",
    "Connaître vos responsabilités légales et éthiques est non négociable.",
    "Conocer tus responsabilidades legales y éticas es innegociable. Si un cliente parece estar en estado de ebriedad, infórma al gerente antes de servir más alcohol. Ofrece agua, comida y transporte alternativo con discreción y sin confrontación."
)

# MODULE 3 QUIZ — read from file to get exact optionsFr
quiz_q(
    "La procédure correcte pour ouvrir une bouteille de vin est:",
    "El procedimiento correcto para abrir una botella de vino es:",
    '["Ouvrir rapidement sans présenter","Présenter l\'étiquette, couper le papier d\'aluminium, retirer le bouchon, servir une dégustation","Ouvrir en cuisine et apporter","Demander au client d\'ouvrir"]',
    ["Abrir rápidamente sin presentar","Presentar la etiqueta, cortar el papel, retirar el corcho, servir una degustación","Abrir en cocina y traer","Pedir al cliente que abra"]
)
quiz_q(
    "Quand devriez-vous suggérer une deuxième bouteille de vin?",
    "¿Cuándo debes sugerir una segunda botella de vino?",
    '["Quand la bouteille est vide","Quand il reste environ un tiers","Seulement si demandé","Au moment du dessert"]',
    ["Cuando la botella está vacía","Cuando queda aproximadamente un tercio","Solo si se solicita","Al momento del postre"]
)
quiz_q(
    "Comment aborder les clients qui ne consomment pas d'alcool?",
    "¿Cómo atender a los clientes que no consumen alcohol?",
    '["Ignorer les options de boissons","Présenter les mocktails et options non alcoolisées avec le même enthousiasme","Suggérer uniquement de l\'eau","Les diriger vers le menu alimentaire"]',
    ["Ignorar las opciones de bebidas","Presentar mocktails y opciones sin alcohol con el mismo entusiasmo","Sugerir solo agua","Dirigirlos al menú de comida"]
)
quiz_q(
    "La bonne façon de tenir un verre à vin est:",
    "La forma correcta de sostener una copa de vino es:",
    '["Par le calice","Par la tige ou la base","Par n\'importe où","Par le haut du verre"]',
    ["Por el cáliz","Por el tallo o la base","Por cualquier parte","Por la parte superior"]
)
quiz_q(
    "Un verre vide sur une table signifie:",
    "Un vaso vacío en la mesa significa:",
    '["Le client a fini","Une opportunité d\'upselling et un signal d\'action","Rien d\'important","Temps de débarrasser la table"]',
    ["El cliente terminó","Una oportunidad de venta y una señal de acción","Nada importante","Momento de recoger la mesa"]
)

# ======================================================
# MODULE 4 — Wine Pairing
# ======================================================
lesson(
    "Les bases de l'accord mets-vins",
    "Las Bases del Maridaje de Vinos",
    "Un accord réussi élève les deux éléments.",
    "El maridaje de vinos es tanto arte como ciencia. La regla básica: vinos blancos ligeros con mariscos y aves, tintos con carnes rojas y aves de caza, vinos dulces con postres. Un maridaje exitoso realza ambos elementos — el vino y el plato."
)
lesson(
    "Blancs et accords",
    "Blancos y Maridajes",
    "La fraîcheur et l'acidité des blancs les rendent polyvalents.",
    "La frescura y la acidez de los blancos los hacen muy versátiles. El Chardonnay con mantequilla marida con langosta y pollo a la crema; el Sauvignon Blanc con queso de cabra y espárragos; el Riesling con comida asiática picante. La regla: la acidez del vino debe igualar la acidez del plato."
)
lesson(
    "Rouges et accords",
    "Tintos y Maridajes",
    "Les tanins des vins rouges s'adoucissent avec les protéines grasses.",
    "Los taninos de los vinos tintos se suavizan con proteínas grasas. El Cabernet Sauvignon con carne de res, cordero y quesos curados; el Pinot Noir con salmón, pato y platos de setas; el Malbec con parrillada y chorizos. Evita los tintos con tánicos con pescado delicado — hacen que el vino sepa metálico."
)
lesson(
    "Vins de dessert & accords sucrés",
    "Vinos de Postre y Maridajes Dulces",
    "Le Sauternes avec le foie gras est l'un des accords les plus classiques de la gastronomie.",
    "El vino de postre debe ser siempre más dulce que el postre en sí. El Sauternes con foie gras es uno de los maridajes más clásicos de la gastronomía. El Oporto con chocolate amargo, el Moscato d'Asti con frutas frescas. Presenta estos maridajes con confianza — elevan el cheque promedio significativamente."
)
lesson(
    "Champagne & vins mousseux",
    "Champagne y Vinos Espumosos",
    "Le Champagne est le vin le plus polyvalent pour les accords.",
    "El Champagne es el vino más versátil para maridajes. Su acidez y efervescencia limpian el paladar y maridan con casi todo — desde ostras hasta papas fritas. Aprende las diferencias entre Brut, Extra Brut y Blanc de Blancs para guiar a los clientes con autoridad."
)
lesson(
    "Comment lire & présenter une carte des vins",
    "Cómo Leer y Presentar una Carta de Vinos",
    "Une carte des vins bien présentée est un outil de vente puissant.",
    "Una carta de vinos bien presentada es una herramienta de venta poderosa. Organízala mentalmente por estilo, no solo por precio. Cuando un cliente dice 'algo medio', piensa primero en el estilo — ¿frutal? ¿terroso? ¿con taninos? Luego navega hacia dos o tres opciones en su rango de precio."
)
lesson(
    "Servir le vin à la bonne température",
    "Servir el Vino a la Temperatura Correcta",
    "La température de service est l'une des erreurs les plus courantes dans les restaurants.",
    "La temperatura de servicio es uno de los errores más comunes en los restaurantes. Los blancos ligeros deben servirse bien fríos (8-10°C); los tintos con cuerpo a temperatura de bodega fresca (16-18°C). Un Chardonnay demasiado frío pierde su complejidad; un Cabernet demasiado caliente sabe alcohólico."
)
lesson(
    "Vocabulaire de dégustation",
    "Vocabulario de Cata",
    "Un vocabulaire de dégustation solide renforce la confiance des clients.",
    "Un vocabulario de cata sólido genera confianza en los clientes. Aprende los descriptores básicos: taninos (sensación de sequedad), acidez (salivación), cuerpo (peso en boca), retrogusto (sabor que persiste). Usa términos que los clientes entiendan: 'suave y afrutado' en lugar de 'poco tánico'."
)
lesson(
    "Décanter le vin",
    "Decantar el Vino",
    "La décantation est un rituel qui impressionne les clients et améliore le vin.",
    "La decantación es un ritual que impresiona a los clientes y mejora el vino. Los vinos tintos jóvenes y tánicos se benefician de la decantación (30-60 min) para abrirse. Los vinos viejos se decantan para separar el sedimento. Realiza este servicio en la mesa con destreza y confianza."
)
lesson(
    "Naviguer les préférences & rejets des clients",
    "Navegar las Preferencias y Rechazos de los Clientes",
    "Un client qui dit 'je n'aime pas le Chardonnay' est une invitation à explorer.",
    "Un cliente que dice 'no me gusta el Chardonnay' es una invitación a explorar. Pregunta: '¿Era demasiado mantecoso o demasiado ácido?' Sus respuestas te guían directamente hacia el vino correcto. Convertir una aversión en un descubrimiento es uno de los gestos más memorables de un mesero experto."
)

# MODULE 4 QUIZ
quiz_q(
    "Quel vin s'accorde le mieux avec le poisson délicat?",
    "¿Qué vino marida mejor con pescado delicado?",
    '["Cabernet Sauvignon","Blanc léger comme le Sauvignon Blanc","Vin de dessert","Porto"]',
    ["Cabernet Sauvignon","Blanco ligero como Sauvignon Blanc","Vino de postre","Oporto"]
)
quiz_q(
    "Pourquoi éviter les vins rouges tanniques avec le poisson?",
    "¿Por qué evitar los vinos tintos tánicos con pescado?",
    '["Trop cher","Ils donnent un goût métallique","Mauvaise couleur","Le client ne les aime pas"]',
    ["Demasiado caros","Hacen que el vino sepa metálico","Mal color","Al cliente no le gustan"]
)
quiz_q(
    "La règle principale pour les vins de dessert est:",
    "La regla principal para los vinos de postre es:",
    '["Servir froid","Le vin doit être plus sucré que le dessert","Toujours servir du Champagne","N\'importe quel vin convient"]',
    ["Servir frío","El vino debe ser más dulce que el postre","Siempre servir Champagne","Cualquier vino sirve"]
)
quiz_q(
    "La température idéale pour les vins rouges corsés est:",
    "La temperatura ideal para los vinos tintos con cuerpo es:",
    '["4-6°C","8-10°C","16-18°C","Température ambiante (24°C+)"]',
    ["4-6°C","8-10°C","16-18°C","Temperatura ambiente (24°C+)"]
)
quiz_q(
    "Quand décantez-vous un vieux vin?",
    "¿Cuándo decantas un vino viejo?",
    '["Jamais","Pour séparer le sédiment","Pour le refroidir","Pour le réchauffer"]',
    ["Nunca","Para separar el sedimento","Para enfriarlo","Para calentarlo"]
)

# ======================================================
# MODULE 5 — Upselling
# ======================================================
lesson(
    "La psychologie de l'upselling",
    "La Psicología de la Venta Sugestiva",
    "L'upselling est du service, pas de la vente.",
    "La venta sugestiva es servicio, no manipulación. Los clientes recuerdan el mesero que los ayudó a descubrir algo increíble, no el que intentó venderles algo. El marco correcto: eres un guía experto, no un vendedor. La confianza y el conocimiento son tus herramientas más poderosas."
)
lesson(
    "L'upselling naturel dès l'arrivée",
    "La Venta Sugestiva Natural desde la Llegada",
    "Ces premières suggestions donnent le ton pour toute l'expérience.",
    "El primer minuto en la mesa es tu mayor oportunidad. '¿Agua con o sin gas esta noche?' convertido con seguridad da inicio al gasto con bebidas premium. Sugiere un aperitivo o cóctel de bienvenida antes de que abran el menú. Estas primeras sugerencias marcan el tono para toda la experiencia."
)
lesson(
    "Le langage de la vente additionnelle",
    "El Lenguaje de la Venta Sugestiva",
    "Les questions ouvertes et les descriptions vives guident les décisions.",
    "Reemplaza el lenguaje cerrado por lenguaje abierto. En lugar de '¿Quiere vino?' prueba '¿Qué estás pensando para el vino esta noche?' En lugar de '¿Algo para empezar?' prueba 'Tenemos un espectacular crudo de atún esta noche que ha ido en casi todas las mesas.' Las preguntas abiertas y las descripciones vívidas guían las decisiones."
)
lesson(
    "Upselling des eaux premium & boissons",
    "Venta Sugestiva de Aguas Premium y Bebidas",
    "Ces petites victoires se cumulent sur chaque table chaque soir.",
    "La apertura del servicio es la oportunidad de venta más fácil. '¿Agua con o sin gas esta noche?' — dicho con confianza — convierte la mayoría de las mesas al agua embotellada. Sigue con una sugerencia de cóctel signature o aperitivo antes de que abran los menús. Estas pequeñas victorias se acumulan en cada mesa cada noche."
)
lesson(
    "Entrées & plats à partager",
    "Entradas y Platos para Compartir",
    "ils se complètent très bien.",
    "Presenta los platos para compartir como un enriquecimiento social, no un costo adicional. 'Esto es algo que muchos de nuestros clientes aman para empezar — está hecho para compartir.' Cuando una mesa duda entre dos entradas, sugiere: 'Podrían pedir ambas y compartir — se complementan muy bien.'"
)
lesson(
    "Protéines premium & suppléments",
    "Proteínas Premium y Suplementos",
    "Cadrez l'upgrade autour de l'expérience, pas du prix.",
    "Conoce tus suplementos: trufa rallada, adición de foie gras, mejora a wagyu, suplemento de langosta. Preséntales como mejoras, no como extras: 'Por dos dólares más, el chef puede terminarlo con trufa negra rallada — es increíble.' Enmarca la mejora alrededor de la experiencia, no del precio."
)
lesson(
    "Le plateau de fromages",
    "La Tabla de Quesos",
    "Notre fromager la compose chaque semaine.",
    "La tabla de quesos es una venta elegante que extiende la comida y aumenta el gasto. Preséntala como una transición natural: 'Antes de traer el menú de postres, ¿les interesa nuestra selección de quesos artesanales? Nuestro quesero la compone semanalmente.' Acompaña cada queso con una recomendación de la carta de vinos."
)
lesson(
    "Vendre les desserts efficacement",
    "Vender los Postres Eficazmente",
    "Une assiette de dessert partagée est presque toujours un oui.",
    "El cierre de la comida es un momento emocional — no lo desperdicies. '¿Tienen espacio para el postre?' es una pregunta que invita al no. En cambio: 'Nuestro fondant de chocolate esta noche está absolutamente increíble — ¿les traigo el menú de postres?' Un plato de postre compartido es casi siempre un sí."
)
lesson(
    "Upselling du café & digestifs",
    "Venta de Café y Digestivos",
    "Un café et un digestif bien vendus augmentent le ticket moyen.",
    "El café y el digestivo son la oportunidad de venta más subestimada. 'Tenemos un expresso de origen único de Etiopía esta noche — realmente termina el sabor del plato principal.' Un coñac, una grappa o un whisky de malta presentado con conocimiento puede aumentar el ticket promedio considerablemente."
)
lesson(
    "Mesurer & améliorer votre taux d'upselling",
    "Medir y Mejorar tu Tasa de Venta Sugestiva",
    "Les meilleurs vendeurs suivent mentalement leur taux de conversion.",
    "Los mejores vendedores siguen mentalmente su tasa de conversión. ¿Cuántas mesas ordenaron agua embotellada? ¿Entrada? ¿Segunda botella? Establece objetivos personales y mejóralos semana a semana. El crecimiento deliberado en la venta sugestiva puede aumentar tu promedio de propinas significativamente."
)

# MODULE 5 QUIZ
quiz_q(
    "L'upselling est mieux décrit comme:",
    "La venta sugestiva se describe mejor como:",
    '["Manipulation des clients","Service guidé par l\'expertise","Vente forcée","Augmentation des prix"]',
    ["Manipulación de clientes","Servicio guiado por la experiencia","Venta forzada","Aumento de precios"]
)
quiz_q(
    "La meilleure question d'ouverture pour les boissons est:",
    "La mejor pregunta de apertura para bebidas es:",
    '["Voulez-vous boire?","Eau plate ou gazeuse ce soir?","Que buvez-vous normalement?","Voulez-vous la carte des vins?"]',
    ["¿Quiere beber algo?","¿Agua con o sin gas esta noche?","¿Qué bebe normalmente?","¿Quiere la carta de vinos?"]
)
quiz_q(
    "Comment positionner les plats à partager?",
    "¿Cómo posicionar los platos para compartir?",
    '["Comme coût supplémentaire","Comme enrichissement social de l\'expérience","Seulement pour les grandes tables","Uniquement quand demandé"]',
    ["Como costo adicional","Como enriquecimiento social de la experiencia","Solo para mesas grandes","Solo cuando se solicita"]
)
quiz_q(
    "Quand suggérer le plateau de fromages?",
    "¿Cuándo sugerir la tabla de quesos?",
    '["Avec l\'entrée","Avant d\'apporter le menu des desserts","Seulement si demandé","Après le dessert"]',
    ["Con la entrada","Antes de traer el menú de postres","Solo si se solicita","Después del postre"]
)
quiz_q(
    "La meilleure façon de vendre un dessert est:",
    "La mejor forma de vender un postre es:",
    '["Demander s\'ils ont de la place","Décrire le dessert spécial avec enthousiasme","Apporter la carte des desserts en silence","Offrir une réduction"]',
    ["Preguntar si tienen espacio","Describir el postre especial con entusiasmo","Traer el menú en silencio","Ofrecer un descuento"]
)

# ======================================================
# MODULE 6 — Food Service
# ======================================================
lesson(
    "La règle de service",
    "La Regla del Servicio",
    "Ces protocoles existent pour faciliter le service, pas pour créer une bureaucratie.",
    "Sirve los platos por la derecha del cliente usando la mano derecha; sirve y retira las bebidas por la derecha. Sirve a las damas primero, luego a los caballeros, terminando con el anfitrión. Estos protocolos existen para facilitar el servicio, no para crear burocracia."
)
lesson(
    "Synchroniser & cadencer le service",
    "Sincronizar y Cadenciar el Servicio",
    "Le rythme de service est l'une des compétences les plus difficiles à maîtriser.",
    "El ritmo del servicio es una de las habilidades más difíciles de dominar. Nunca dejes que una mesa espere un plato más de 15 minutos entre cursos sin comunicación. Para grupos grandes, coordina con la cocina para que todos los platos salgan a la vez. El ritmo perfecto se siente invisible — los clientes simplemente se sienten bien atendidos."
)
lesson(
    "Service sans faille pour les repas à plusieurs plats",
    "Servicio Impecable para Comidas de Varios Platos",
    "Chaque cours doit être une expérience en soi.",
    "Cada curso debe ser una experiencia en sí mismo. Retira los platos de la entrada antes de servir el principal. Cambia los cubiertos entre cursos según sea necesario. Anuncia cada plato brevemente: '¡El rape con mantequilla de naranja — buen provecho!' Cada curso debe ser una experiencia en sí mismo."
)
lesson(
    "Gérer les plats chauds & froids",
    "Gestionar Platos Calientes y Fríos",
    "Un plat qui refroidit est un signe de service négligent.",
    "Los platos calientes deben entregarse calientes — nunca toques la superficie del plato para comprobarlo delante del cliente. Advierte verbalmente: 'El plato está muy caliente.' Los platos fríos deben estar fríos — nunca sirvas gazpacho tibio. Un plato que se enfría es una señal de servicio descuidado."
)
lesson(
    "Timing avec la cuisine",
    "Sincronización con la Cocina",
    "La communication avec la cuisine est l'épine dorsale d'un service fluide.",
    "La comunicación con la cocina es la columna vertebral de un servicio fluido. Coloca los pedidos en el orden correcto: entradas, luego principales cuando la mesa esté casi terminando las entradas. Para grupos grandes, avisa a la cocina con anticipación. La comunicación proactiva previene el 80% de los problemas de ritmo."
)
lesson(
    "Débarrasser correctement",
    "Retirar los Platos Correctamente",
    "Ne débarrassez jamais tant qu'un seul convive mange encore.",
    "Nunca retires un plato mientras algún comensal todavía esté comiendo. Espera siempre a que toda la mesa haya terminado antes de empezar a retirar. Retira los platos desde la derecha. Apilas los platos discretamente en el lado — nunca hagas malabarismos con torres de platos frente a los clientes."
)
lesson(
    "Gérer les problèmes de commande",
    "Gestionar Problemas con los Pedidos",
    "Ne blâmez jamais la cuisine devant le client.",
    "Cuando un plato sale incorrecto, actúa de inmediato: recoge el plato, discúlpate brevemente y ve a la cocina. No culpes a la cocina frente al cliente. Informa al gerente si hay demora. Un error manejado con gracia puede convertirse en un momento que hace al cliente más fiel, no menos."
)
lesson(
    "Le service de pain & d'amuse-bouches",
    "El Servicio del Pan y Aperitivos",
    "Le pain est le premier contact alimentaire — il donne le ton.",
    "El pan es el primer contacto alimentario — marca el tono. Sirve el pan fresco al inicio con la mantequilla correspondiente y rellena proactivamente. Los aperitivos del chef son una oportunidad para establecer el nivel del restaurante: nómbralos con orgullo y explica la técnica del chef si es posible."
)
lesson(
    "Service à la russe vs. à la française",
    "Servicio a la Rusa vs. a la Francesa",
    "Connaître les deux styles vous prépare à n'importe quel environnement.",
    "El servicio a la rusa (platos ya emplatados desde la cocina) es el estándar moderno — eficiente y consistente. El servicio a la francesa (servido en mesa desde fuentes) es más ceremonial, usado para grupos grandes o eventos de gala. Conocer ambos estilos te prepara para cualquier entorno."
)
lesson(
    "Rythme final : café, digestif & congé",
    "Ritmo Final: Café, Digestivo y Despedida",
    "Les dernières minutes d'un repas sont tout aussi importantes que les premières.",
    "Los últimos minutos de una comida son tan importantes como los primeros. Ofrece café, digestivos o infusiones con conocimiento y entusiasmo. Trae la cuenta oportunamente cuando se solicite — hacerlos esperar es frustrante. La despedida debe ser cálida y personal: 'Ha sido un placer atenderles esta noche.'"
)

# MODULE 6 QUIZ
quiz_q(
    "La règle de service standard est de servir:",
    "La regla de servicio estándar es servir:",
    '["Par la gauche avec la main gauche","Par la droite avec la main droite","Par n\'importe quel côté","Par derrière le client"]',
    ["Por la izquierda con la mano izquierda","Por la derecha con la mano derecha","Por cualquier lado","Por detrás del cliente"]
)
quiz_q(
    "Quand devriez-vous débarrasser une assiette?",
    "¿Cuándo debes retirar un plato?",
    '["Quand le client a fini","Quand tous les convives ont fini","Quand vous en avez l\'occasion","Quand la cuisine envoie le prochain plat"]',
    ["Cuando el cliente terminó","Cuando todos los comensales han terminado","Cuando tengas oportunidad","Cuando la cocina envía el siguiente plato"]
)
quiz_q(
    "La meilleure façon de gérer un plat incorrect est:",
    "La mejor forma de gestionar un plato incorrecto es:",
    '["Blâmer la cuisine","S\'excuser brièvement et corriger immédiatement","Ignorer et espérer que le client ne remarque pas","Offrir un rabais"]',
    ["Culpar a la cocina","Disculparse brevemente y corregir de inmediato","Ignorarlo y esperar que el cliente no note","Ofrecer un descuento"]
)
quiz_q(
    "Comment gérer les plats chauds?",
    "¿Cómo manejar los platos calientes?",
    '["Dire au client de faire attention","Avertir verbalement que le plat est chaud","Ne rien dire","Laisser refroidir avant de servir"]',
    ["Decirle al cliente que tenga cuidado","Advertir verbalmente que el plato está caliente","No decir nada","Dejar enfriar antes de servir"]
)
quiz_q(
    "Le rôle du timing avec la cuisine est:",
    "El rol de la sincronización con la cocina es:",
    '["Optionnel","Fondamental pour un service fluide","Seulement pour les grandes tables","Responsabilité du chef"]',
    ["Opcional","Fundamental para un servicio fluido","Solo para mesas grandes","Responsabilidad del chef"]
)

# ======================================================
# MODULE 7 — Table Maintenance
# ======================================================
lesson(
    "Maintenir une table impeccable",
    "Mantener una Mesa Impecable",
    "Une table propre est le reflet silencieux de votre professionnalisme.",
    "Una mesa limpia es el reflejo silencioso de tu profesionalismo. Retira las migas discretamente entre cursos con un limpiamigas. Reemplaza los cubiertos sucios sin que te lo pidan. Alinea los vasos y platos. Una mesa impecable en todo momento comunica al cliente que está en buenas manos."
)
lesson(
    "Prévention des problèmes",
    "Prevención de Problemas",
    "La prévention est toujours préférable à la récupération.",
    "Los mejores meseros rara vez tienen que apagar incendios porque los previenen. Revisa la configuración de la mesa antes de que el cliente llegue. Confirma los pedidos especiales con la cocina. Comunícate con el personal de apoyo sobre el ritmo. La prevención siempre es preferible a la recuperación."
)
lesson(
    "Récupérer les erreurs avec grâce",
    "Recuperar los Errores con Elegancia",
    "La façon dont vous gérez un problème en dit plus sur votre niveau de service qu'un repas parfait.",
    "Cómo manejas un problema dice más sobre tu nivel de servicio que una comida perfecta. Reconoce el error de inmediato, sin excusas. Discúlpate sinceramente. Toma acción. Haz seguimiento. Un cliente cuyo problema fue resuelto magistralmente a menudo se convierte en el cliente más fiel."
)
lesson(
    "Gérer les clients en colère",
    "Gestionar Clientes Enojados",
    "Ne prenez jamais les plaintes personnellement.",
    "Nunca tomes las quejas de forma personal — el cliente está enojado con la situación, no contigo. Escucha activamente sin interrumpir. Valida sus sentimientos: 'Entiendo perfectamente por qué eso es frustrante.' Toma acción visible e inmediata. Involucra al gerente cuando sea necesario."
)
lesson(
    "La gestion des déversements",
    "Gestión de Derrames",
    "La rapidité et la discrétion sont essentielles.",
    "Los derrames suceden — tu reacción determina si se convierten en un problema. Actúa de inmediato con discreción. Ofrece toallas limpias o servilletas. Si se derramó sobre el cliente, discúlpate sinceramente y ofrece ayuda con la limpieza. Nunca minimices el derrame ni hagas al cliente sentir responsable."
)
lesson(
    "Résoudre les conflits entre clients",
    "Resolver Conflictos entre Clientes",
    "Votre rôle est de désamorcer, pas d'arbitrer.",
    "Ocasionalmente surgirán conflictos entre clientes — mesas ruidosas versus parejas tranquilas, disputas sobre la cuenta. Tu rol es desescalar, no arbitrar. Habla en voz baja y privada. Ofrece soluciones, no juicios. Involucra al gerente si la situación escala."
)
lesson(
    "Protocoles de fin de service",
    "Protocolos de Fin de Servicio",
    "La fin du service est aussi importante que le début.",
    "El fin del servicio es tan importante como el inicio. Asegúrate de que todas las mesas estén correctamente preparadas para el próximo turno. Verifica que los pedidos especiales estén anotados. Haz el traspaso al turno siguiente con información clara sobre las mesas activas."
)
lesson(
    "Communication avec la cuisine & les collègues",
    "Comunicación con la Cocina y los Compañeros",
    "Le travail d'équipe est la base d'un service exceptionnel.",
    "El trabajo en equipo es la base de un servicio excepcional. Comunica los cambios de pedido de inmediato. Avisa a los compañeros cuando necesitas apoyo. Agradece el trabajo del personal de apoyo — crean el ambiente que permite tu servicio. Un equipo que se comunica bien raramente falla."
)
lesson(
    "Retours & plaintes formelles",
    "Devoluciones y Quejas Formales",
    "Une plainte est un cadeau — elle vous donne l'opportunité de vous améliorer.",
    "Una queja es un regalo — te da la oportunidad de mejorar. Cuando un cliente está tan insatisfecho que pide hablar con el gerente, escucha sin ponerte a la defensiva. Toma nota de los detalles. Asegúrate de hacer seguimiento para confirmar que el cliente salió satisfecho."
)
lesson(
    "Gestion de la fin de soirée",
    "Gestión del Final de la Noche",
    "Les derniers clients méritent le même niveau de service que les premiers.",
    "Los últimos clientes merecen el mismo nivel de servicio que los primeros. No empieces a recoger la sala en su presencia. Mantén la energía y la atención hasta que el último cliente se haya ido. Los rituales de cierre de servicio son importantes para el equipo — completar juntos el trabajo termina el turno en un punto alto."
)

# MODULE 7 QUIZ
quiz_q(
    "Comment devriez-vous gérer une plainte d'un client?",
    "¿Cómo debes manejar la queja de un cliente?",
    '["La prendre personnellement","Écouter, valider, agir et assurer le suivi","Blâmer la cuisine","Ignorer si elle semble exagérée"]',
    ["Tomarla personalmente","Escuchar, validar, actuar y hacer seguimiento","Culpar a la cocina","Ignorarla si parece exagerada"]
)
quiz_q(
    "La meilleure façon de prévenir les problèmes est:",
    "La mejor forma de prevenir problemas es:",
    '["Attendre qu\'ils se produisent","Vérifications proactives et communication","Travailler plus rapidement","Espérer que rien ne se passe"]',
    ["Esperar a que ocurran","Verificaciones proactivas y comunicación","Trabajar más rápido","Esperar que no pase nada"]
)
quiz_q(
    "Quand un client renverse quelque chose, vous devriez:",
    "Cuando un cliente derrama algo, debes:",
    '["Leur reprocher","Agir immédiatement avec discrétion et aide","Attendre la fin du repas","Envoyer quelqu\'un d\'autre"]',
    ["Culparles","Actuar de inmediato con discreción y ayuda","Esperar al final de la comida","Enviar a alguien más"]
)
quiz_q(
    "Une table impeccable est maintenue:",
    "Una mesa impecable se mantiene:",
    '["Seulement avant que les clients arrivent","Tout au long du repas, de manière proactive","Seulement après le dessert","Quand les clients se plaignent"]',
    ["Solo antes de que lleguen los clientes","Durante toda la comida, de forma proactiva","Solo después del postre","Cuando los clientes se quejan"]
)
quiz_q(
    "Votre rôle dans un conflit entre clients est:",
    "Tu rol en un conflicto entre clientes es:",
    '["Arbitrer qui a raison","Désamorcer la situation calmement","Ignorer le conflit","Prendre parti"]',
    ["Arbitrar quién tiene razón","Desescalar la situación con calma","Ignorar el conflicto","Tomar partido"]
)

# ======================================================
# MODULE 8 — International Etiquette
# ======================================================
lesson(
    "Conscience culturelle en restauration",
    "Conciencia Cultural en Hostelería",
    "La conscience culturelle transforme un bon service en service exceptionnel.",
    "La conciencia cultural transforma el buen servicio en servicio excepcional. Los clientes de diferentes culturas tienen diferentes expectativas sobre el espacio personal, el contacto visual, el tono de voz y el ritmo del servicio. Aprende a leer las señales y adapta tu estilo naturalmente."
)
lesson(
    "Étiquette de service en Asie de l'Est",
    "Etiqueta de Servicio en Asia Oriental",
    "Les clients japonais, coréens et chinois apprécient la discrétion et la formalité.",
    "Los clientes japoneses, coreanos y chinos valoran la discreción y la formalidad. En la cultura japonesa, el silencio es un signo de satisfacción. En la cultura china, la hospitalidad incluye reflenar proactivamente sin pedir. Aprende estos matices para ofrecer un servicio que honre su cultura."
)
lesson(
    "Étiquette de service au Moyen-Orient",
    "Etiqueta de Servicio en Medio Oriente",
    "Connaître les prescriptions alimentaires halal est essentiel.",
    "Conocer las prescripciones alimentarias halal es esencial en restaurantes con clientela del Medio Oriente. Nunca asumas que un cliente que parece ser de Medio Oriente consume o evita el alcohol — pregunta discretamente. El respeto y la deferencia formal son muy valorados."
)
lesson(
    "Étiquette de service en Europe",
    "Etiqueta de Servicio en Europa",
    "Les attentes européennes varient considérablement selon le pays.",
    "Las expectativas europeas varían considerablemente según el país. Los clientes franceses aprecian el servicio formal y sin prisa; los alemanes valoran la eficiencia y la precisión; los británicos prefieren la calidez discreta. Adapta tu ritmo y formalidad según lo que detectas en la mesa."
)
lesson(
    "Gérer les barrières linguistiques",
    "Gestionar las Barreras del Idioma",
    "Un client qui parle peu la langue locale mérite autant d\'attention qu\'un locuteur natif.",
    "Un cliente que habla poco el idioma local merece tanta atención como un hablante nativo. Habla despacio y claramente — no más alto. Usa el menú como apoyo visual. Gestos y sonrisas son universales. Si está disponible, busca a un colega que comparta el idioma del cliente."
)
lesson(
    "Restrictions & prescriptions alimentaires religieuses",
    "Restricciones y Prescripciones Alimentarias Religiosas",
    "Traiter les prescriptions alimentaires avec sérieux est une marque de professionnalisme.",
    "Tratar las prescripciones alimentarias con seriedad es una marca de profesionalismo. Halal, kosher, hindú (sin carne de res), budista (frecuentemente vegetariano) — conoce las implicaciones básicas de cada uno. Si no estás seguro, siempre confirma con la cocina antes de recomendar un plato."
)
lesson(
    "Différences générationnelles dans les attentes",
    "Diferencias Generacionales en las Expectativas",
    "S'adapter aux différentes générations fait partie du service moderne.",
    "Adaptarse a las diferentes generaciones es parte del servicio moderno. Los clientes mayores frecuentemente prefieren el servicio formal y la interacción directa. Los millennials y la generación Z aprecian la autenticidad, la velocidad y la transparencia sobre los ingredientes. Adapta tu comunicación sin estereotipar."
)
lesson(
    "Touristes vs. habitués",
    "Turistas vs. Clientes Habituales",
    "Les habitués sont l'or de votre restaurant — traitez-les comme tels.",
    "Los clientes habituales son el oro de tu restaurante — tratatlos como tal. Recuerda sus preferencias, su nombre y sus ocasiones especiales. Los turistas necesitan más orientación y paciencia — están descubriendo el restaurante por primera vez. Ambos merecen el mismo nivel de servicio, con enfoques diferentes."
)

# MODULE 8 QUIZ
quiz_q(
    "La conscience culturelle en service signifie:",
    "La conciencia cultural en el servicio significa:",
    '["Traiter tous les clients de la même façon","Adapter votre style à différents contextes culturels","Connaître les drapeaux de chaque pays","Parler plusieurs langues"]',
    ["Tratar a todos los clientes igual","Adaptar tu estilo a diferentes contextos culturales","Conocer las banderas de cada país","Hablar varios idiomas"]
)
quiz_q(
    "En cas de barrière linguistique, vous devriez:",
    "En caso de barrera idiomática, debes:",
    '["Parler plus fort","Parler lentement et clairement, utiliser le menu comme aide visuelle","Éviter la table","Demander au client de revenir quand il parle la langue"]',
    ["Hablar más fuerte","Hablar despacio y claramente, usar el menú como ayuda visual","Evitar la mesa","Pedirle al cliente que vuelva cuando hable el idioma"]
)
quiz_q(
    "Les prescriptions alimentaires halal impliquent:",
    "Las prescripciones alimentarias halal implican:",
    '["Végétarisme uniquement","Pas de porc ni d\'alcool, viande abattue selon des rites spécifiques","Pas de fruits de mer","Seulement des aliments crus"]',
    ["Solo vegetarianismo","Sin cerdo ni alcohol, carne sacrificada según ritos específicos","Sin mariscos","Solo alimentos crudos"]
)
quiz_q(
    "Comment traiter un client habituel différemment d'un touriste?",
    "¿Cómo tratar a un cliente habitual diferente a un turista?",
    '["Donner de meilleures tables","Se souvenir de leurs préférences et occasions spéciales","Offrir des remises","Ignorer les autres clients"]',
    ["Darle mejores mesas","Recordar sus preferencias y ocasiones especiales","Ofrecer descuentos","Ignorar a otros clientes"]
)
quiz_q(
    "Un client silencieux lors d'un repas de cuisine japonaise signifie souvent:",
    "Un cliente silencioso durante una comida de cocina japonesa frecuentemente significa:",
    '["Mécontentement","Satisfaction — le silence est positif dans cette culture","Ennui","Qu\'ils veulent partir"]',
    ["Insatisfacción","Satisfacción — el silencio es positivo en esa cultura","Aburrimiento","Que quieren irse"]
)

# ======================================================
# MODULE 9 — Special Occasions
# ======================================================
lesson(
    "Gérer les anniversaires & célébrations",
    "Gestionar Cumpleaños y Celebraciones",
    "Un anniversaire bien géré génère des visites répétées.",
    "Un cumpleaños bien gestionado genera visitas repetidas. Confirma los detalles en la reserva: ¿hay un pastel? ¿música sorpresa? ¿mensaje especial? Coordina con la cocina y el resto del equipo antes del servicio. Una celebración ejecutada a la perfección es publicidad de boca en boca inigualable."
)
lesson(
    "Coordonner les surprises à table",
    "Coordinar las Sorpresas en la Mesa",
    "La communication discrète avec le groupe organisateur est clé.",
    "La comunicación discreta con el grupo organizador es clave. Pregunta al organizador qué saben los demás y cuándo quieren que ocurra la sorpresa. Coordina con la cocina el timing del pastel o el plato especial. Los mejores meseros hacen que la magia parezca effortless — aunque requiere coordinación precisa."
)
lesson(
    "Propositions de mariage & moments spéciaux",
    "Propuestas de Matrimonio y Momentos Especiales",
    "Ces moments n'arrivent qu'une fois — la pression est réelle.",
    "Estos momentos solo ocurren una vez — la presión es real. Cuando alguien planifica una propuesta, escucha cuidadosamente todos los detalles. ¿La sortija llega en el postre? ¿Hay flores escondidas? ¿El fotógrafo está listo? Sincroniza con todo el equipo y mantén el secreto absoluto. Tu rol es hacer que este momento sea perfecto."
)
lesson(
    "Tables d'affaires & repas d'entreprise",
    "Mesas de Negocios y Comidas Corporativas",
    "Le service discret et efficace est primordial.",
    "El servicio discreto y eficiente es primordial en las comidas de negocios. Los clientes están en reunión — interrumpe con mínima frecuencia y máxima discreción. Lee las señales: si están en negociación intensa, no intentes entablar conversación. Si el cliente de honor todavía está hablando, no retires los platos."
)
lesson(
    "Gérer les grands groupes & événements",
    "Gestionar Grupos Grandes y Eventos",
    "Les grands groupes exigent une préparation méticuleuse.",
    "Los grupos grandes exigen preparación meticulosa. Revisa el menú con el organizador con anticipación. Confirma las restricciones alimentarias. Asigna roles claros al equipo. Para grupos de más de 12, considera un menú preestablecido para asegurar el ritmo. La clave: todos los platos principales salen simultáneamente."
)
lesson(
    "Tables en deuil & repas de commémoration",
    "Mesas de Duelo y Comidas de Conmemoración",
    "La discrétion et la sensibilité sont les maîtres mots.",
    "La discreción y la sensibilidad son las palabras clave. Un grupo en duelo necesita espacio, tranquilidad y atención sin intrusión. Habla en voz baja, muévete lentamente y lee el ambiente constantemente. Un servicio compasivo en un momento difícil crea una impresión duradera de humanidad."
)
lesson(
    "Repas de Saint-Valentin & escapades romantiques",
    "Cenas de San Valentín y Escapadas Románticas",
    "L'atmosphère est aussi importante que la nourriture.",
    "El ambiente es tan importante como la comida. Las parejas en San Valentín quieren atención pero no intrusión. Asegúrate de que la mesa esté perfectamente presentada antes de su llegada. Ofrece el menú especial con entusiasmo. Permite las pausas largas — no los apresures. Un toque de personalización (una nota del chef, flores extras) crea magia."
)
lesson(
    "Graduations & jalons de carrière",
    "Graduaciones e Hitos de Carrera",
    "Ces célébrations méritent d'être reconnues.",
    "Estas celebraciones merecen ser reconocidas. Si escuchas que es una graduación o un ascenso, felicita brevemente y con sinceridad. Ofrece una copa de cortesía del chef si el gerente lo aprueba. Los pequeños gestos de reconocimiento hacen que los clientes se sientan vistos y valiosos."
)

# MODULE 9 QUIZ
quiz_q(
    "Quand un client planifie une surprise à table, vous devriez:",
    "Cuando un cliente planifica una sorpresa en la mesa, debes:",
    '["Improviser le moment","Coordonner discrètement avec l\'équipe et suivre le plan","Annoncer la surprise à voix haute","Demander à tous les clients"]',
    ["Improvisar el momento","Coordinar discretamente con el equipo y seguir el plan","Anunciar la sorpresa en voz alta","Preguntar a todos los clientes"]
)
quiz_q(
    "Pour les tables d'affaires, la priorité est:",
    "Para las mesas de negocios, la prioridad es:",
    '["Un service rapide","Un service discret et efficace avec un minimum d\'interruptions","Engager une conversation","Présenter de nombreuses options de vente"]',
    ["Servicio rápido","Servicio discreto y eficiente con mínimas interrupciones","Entablar conversación","Presentar muchas opciones de venta"]
)
quiz_q(
    "Pour les grands groupes, la meilleure solution pour le timing des plats est:",
    "Para grupos grandes, la mejor solución para el ritmo de los platos es:",
    '["Servir quand les plats sont prêts","Un menu préétabli pour un timing garanti","Demander à chacun de commander séparément","Servir le buffet"]',
    ["Servir cuando los platos estén listos","Un menú preestablecido para un timing garantizado","Pedir a cada uno que ordene separadamente","Servir buffet"]
)
quiz_q(
    "Comment aborder une table en deuil?",
    "¿Cómo atender una mesa en duelo?",
    '["Normalement, sans changement","Avec discrétion, douceur et en lisant l\'atmosphère","Éviter la table autant que possible","Leur demander comment ils se sentent"]',
    ["Normalmente, sin cambios","Con discreción, delicadeza y leyendo el ambiente","Evitar la mesa tanto como sea posible","Preguntarles cómo se sienten"]
)
quiz_q(
    "La clé d'une surprise réussie à table est:",
    "La clave para una sorpresa exitosa en la mesa es:",
    '["La vitesse","La coordination méticuleuse et le secret","La taille du gâteau","Faire participer tous les clients"]',
    ["La velocidad","La coordinación meticulosa y el secreto","El tamaño del pastel","Hacer participar a todos los clientes"]
)

# ======================================================
# MODULE 10 — Closing the Experience
# ======================================================
lesson(
    "La psychologie de la fin du repas",
    "La Psicología del Final de la Comida",
    "Les derniers moments d'un repas sont les plus mémorables.",
    "Los últimos momentos de una comida son los más memorables — los clientes se van con esa impresión. No aflojes el ritmo ni la atención al final. Un cierre fuerte — café, digestivo, cuenta presentada con gracia — consolida toda la experiencia positiva y asegura la próxima visita."
)
lesson(
    "Présenter la note avec élégance",
    "Presentar la Cuenta con Elegancia",
    "La note n'est pas une invitation à partir — c'est la conclusion de l'expérience.",
    "La cuenta no es una invitación a irse — es la conclusión de la experiencia. Preséntala en un portacuentas limpio, con discreción. Nunca pongas la cuenta en la mesa sin que te la hayan pedido — señala que los quieres fuera. Cuando la soliciten, actúa de inmediato. Procesa el pago eficientemente y sin errores."
)
lesson(
    "Gérer les réclamations sur la note",
    "Gestionar Reclamaciones sobre la Cuenta",
    "Les erreurs de facturation érodent la confiance — corrigez-les immédiatement.",
    "Los errores de facturación erosionan la confianza — corrígelos de inmediato y sin drama. Si el cliente está en desacuerdo con un cargo, escucha, verifica y actúa. Nunca discutas con el cliente sobre la cuenta. Si hay duda, involucra al gerente. Resolver con elegancia convierte un potencial conflicto en confianza."
)
lesson(
    "L'art de la récupération de service",
    "El Arte de la Recuperación del Servicio",
    "Une récupération de service magistrale peut transformer un client insatisfait en ambassadeur.",
    "Una recuperación de servicio magistral puede transformar a un cliente insatisfecho en un embajador. Reconoce el problema, discúlpate sinceramente, toma acción inmediata y haz un seguimiento antes de que se vayan. Considera un gesto adicional — un postre cortesía, un digestivo — que comunique que te importa genuinamente."
)
lesson(
    "L'invitation au retour",
    "La Invitación al Regreso",
    "Chaque au revoir est une invitation à revenir.",
    "Cada despedida es una invitación a regresar. 'Ha sido un placer tenerles esta noche' seguido de algo específico sobre su visita — 'Espero que hayan disfrutado el trío de langosta' — crea una conexión personal. Si conoces su nombre, úsalo. La personalización en el momento de despedida es lo que los hace volver."
)
lesson(
    "La gestion des pourboires",
    "La Gestión de las Propinas",
    "Ne jamais montrer de déception ou de gratitude excessive.",
    "La propina es el reflejo de la experiencia total del cliente. Nunca muestres decepción ni gratitud excesiva — ambas son inapropiadas. Agradece brevemente y con sinceridad. En restaurantes con propina compartida, asegúrate de que el personal de apoyo reciba su parte — es un principio ético fundamental."
)
lesson(
    "Fidélisation & clients réguliers",
    "Fidelización y Clientes Regulares",
    "Les clients réguliers sont votre actif le plus précieux.",
    "Los clientes regulares son tu activo más valioso. Recuerda su nombre, sus preferencias, su mesa favorita, sus alergias. Cuando un cliente regresa y lo reconoces, la relación pasa de transaccional a personal. Esta conexión es lo que genera visitas regulares y recomendaciones a amigos y familia."
)
lesson(
    "Les médias sociaux & la réputation en ligne",
    "Las Redes Sociales y la Reputación Online",
    "Chaque table est un potentiel critique en ligne.",
    "Cada mesa es un potencial crítico online. Asegúrate de que la experiencia sea tan buena que quieran compartirla. Si ves a alguien fotografiar sus platos, ofrece un ángulo mejor o explica el plato para una descripción más rica. Las reseñas positivas generan nuevos clientes — las negativas las ahuyentan."
)

# MODULE 10 QUIZ
quiz_q(
    "Quand devez-vous présenter la note?",
    "¿Cuándo debes presentar la cuenta?",
    '["Dès que le dessert est servi","Immédiatement quand les clients la demandent","Après 10 minutes d\'attente","Quand la cuisine ferme"]',
    ["Cuando se sirve el postre","De inmediato cuando los clientes la solicitan","Después de 10 minutos de espera","Cuando cierra la cocina"]
)
quiz_q(
    "Un client conteste un montant sur la note. Vous devriez:",
    "Un cliente disputa un monto en la cuenta. Debes:",
    '["Argumenter que c\'est correct","Écouter, vérifier et corriger si nécessaire","Ignorer la plainte","Appeler la police"]',
    ["Argumentar que es correcto","Escuchar, verificar y corregir si es necesario","Ignorar la queja","Llamar a la gerencia inmediatamente"]
)
quiz_q(
    "Une récupération de service efficace comprend:",
    "Una recuperación de servicio efectiva incluye:",
    '["Des excuses seulement","Reconnaître, s\'excuser, agir et faire un suivi","Blâmer d\'autres membres du personnel","Offrir de ne pas facturer"]',
    ["Solo disculpas","Reconocer, disculparse, actuar y hacer seguimiento","Culpar a otros miembros del equipo","Ofrecer no cobrar"]
)
quiz_q(
    "La meilleure façon de fidéliser les clients est:",
    "La mejor forma de fidelizar a los clientes es:",
    '["Offrir des réductions","Se souvenir de leurs noms, préférences et créer une connexion personnelle","Avoir les prix les plus bas","Avoir le meilleur emplacement"]',
    ["Ofrecer descuentos","Recordar sus nombres, preferencias y crear una conexión personal","Tener los precios más bajos","Tener la mejor ubicación"]
)
quiz_q(
    "Concernant les pourboires, un serveur devrait:",
    "Respecto a las propinas, un mesero debe:",
    '["Exprimer sa déception si trop bas","Exprimer une gratitude excessive","Remercier brièvement et sincèrement","Ignorer le pourboire"]',
    ["Expresar decepción si es baja","Expresar gratitud excesiva","Agradecer brevemente y con sinceridad","Ignorar la propina"]
)

# ======================================================
# MODULE 11 — Wine Regions (lesson titles seen from grep)
# ======================================================
lesson(
    "La France : Bordeaux & Bourgogne",
    "Francia: Burdeos y Borgoña",
    "Ces deux régions définissent les standards mondiaux du vin.",
    "Burdeos y Borgoña son los dos puntos de referencia del mundo del vino. Burdeos produce tintos de Cabernet Sauvignon y Merlot con estructura y longevidad. Borgoña produce los Pinot Noir y Chardonnay más finos del mundo, con un enfoque en el terroir y los pequeños viñedos llamados 'climats'."
)
lesson(
    "La France : Rhône, Loire & Champagne",
    "Francia: Ródano, Loira y Champagne",
    "Le Rhône est la patrie du Syrah du nord et des assemblages puissants du sud.",
    "El Ródano es el hogar del Syrah del norte y los poderosos ensamblajes del sur. El Loira produce Sauvignon Blanc (Sancerre, Pouilly-Fumé), Chenin Blanc y Cabernet Franc. Champagne es la única región autorizada a llamar 'Champagne' a sus espumosos — aprende las maisons y los estilos para guiar a los clientes con autoridad."
)
lesson(
    "L'Italie : Toscane & Piémont",
    "Italia: Toscana y Piamonte",
    "L'Italie produit plus de cépages autochtones que tout autre pays.",
    "Italia produce más variedades autóctonas que cualquier otro país. La Toscana es el hogar del Chianti Classico, Brunello di Montalcino y Bolgheri (los 'Super Toscanos'). El Piamonte produce el Barolo y Barbaresco — los reyes del vino italiano, elaborados con Nebbiolo."
)
lesson(
    "L'Espagne & le Portugal",
    "España y Portugal",
    "L'Espagne a plus de superficie viticole que tout autre pays.",
    "España tiene más superficie vitivinícola que cualquier otro país. La Rioja es famosa por sus Tempranillos con crianza en barrica de roble. La Ribera del Duero produce Tempranillos más concentrados y potentes. Portugal es el hogar del Oporto y del Vinho Verde — aprende ambos para sorprender a los clientes."
)
lesson(
    "L'Allemagne & l'Autriche",
    "Alemania y Austria",
    "L'Allemagne produit certains des meilleurs Rieslings du monde.",
    "Alemania produce algunos de los mejores Rieslings del mundo — desde Extra Brut hasta dulcísimos Trockenbeerenauslese. La clasificación alemana por nivel de dulzor (Kabinett, Spätlese, Auslese) es compleja pero vale la pena aprenderla. Austria produce excelentes Grüner Veltliner secos y Rieslings de la región de Wachau."
)
lesson(
    "L'Australie & la Nouvelle-Zélande",
    "Australia y Nueva Zelanda",
    "Central Otago produit un Pinot Noir de climat froid de classe mondiale.",
    "El Barossa Valley australiano produce Shiraz potente; Clare y Eden Valleys son reconocidas por el Riesling; Margaret River por el Cabernet. El Sauvignon Blanc de Marlborough en Nueva Zelanda estableció el estándar mundial para esa variedad — fresco, herbáceo, con intensas frutas tropicales. Central Otago produce Pinot Noir de clima frío de clase mundial."
)
lesson(
    "Amérique du Sud : Argentine & Chili",
    "América del Sur: Argentina y Chile",
    "Les deux pays offrent une qualité exceptionnelle à des prix compétitifs.",
    "La región de Mendoza en Argentina alberga el Malbec — la variedad signature del país. En altitud, estos vinos desarrollan una concentración extraordinaria. Los vinos chilenos se extienden de la costa a la montaña: el Valle de Casablanca para blancos, el Valle de Maipo para Cabernet, Colchagua para Carménère. Ambos países ofrecen calidad excepcional a precios competitivos."
)
lesson(
    "Les États-Unis : au-delà de Napa",
    "Estados Unidos: Más allá de Napa",
    "La carte viticole américaine s'étend bien au-delà de la Californie.",
    "El Cabernet de Napa Valley es mundialmente famoso, pero el Pinot Noir del Willamette Valley de Oregón rivaliza con Borgoña. El estado de Washington produce excelentes Riesling, Merlot y Syrah. El condado de Sonoma alberga microclimas diversos — Russian River Valley para Pinot Noir y Chardonnay de clima frío, Dry Creek Valley para Zinfandel."
)
lesson(
    "Lire & naviguer une carte des vins",
    "Leer y Navegar una Carta de Vinos",
    "Guidez les clients en demandant leur style préféré, puis en pointant avec confiance deux ou trois options à leur gamme de prix.",
    "Las cartas de vinos se organizan por país, región o estilo. El año del vintage indica el año de la cosecha — en climas consistentes (Nuevo Mundo) importa menos; en climas variables (Viejo Mundo) importa mucho. El nombre del productor (château, domaine, estate) es a menudo tan importante como la uva. Guía a los clientes preguntando su estilo preferido y señalando con confianza dos o tres opciones en su rango de precio."
)

# MODULE 11 QUIZ
quiz_q(
    "Bordeaux est principalement connu pour:",
    "Burdeos es principalmente conocido por:",
    '["Chardonnay & Riesling","Assemblages de Cabernet Sauvignon & Merlot","Pinot Noir & Syrah","Vins de dessert"]',
    ["Chardonnay y Riesling","Ensamblajes de Cabernet Sauvignon y Merlot","Pinot Noir y Syrah","Vinos de postre"]
)
quiz_q(
    "Le Marlborough en Nouvelle-Zélande est célèbre pour:",
    "Marlborough en Nueva Zelanda es famoso por:",
    '["Pinot Noir","Sauvignon Blanc","Chardonnay","Riesling"]',
    ["Pinot Noir","Sauvignon Blanc","Chardonnay","Riesling"]
)
quiz_q(
    "Le cépage signature de l'Argentine est:",
    "La variedad signature de Argentina es:",
    '["Carménère","Malbec","Tempranillo","Zinfandel"]',
    ["Carménère","Malbec","Tempranillo","Zinfandel"]
)
quiz_q(
    "Les vins de Bourgogne sont principalement:",
    "Los vinos de Borgoña son principalmente:",
    '["Assemblages de Bordeaux","Monovariétaux (Pinot Noir ou Chardonnay)","Vins fortifiés","Vins pétillants"]',
    ["Ensamblajes de Burdeos","Monovarietales (Pinot Noir o Chardonnay)","Vinos fortificados","Vinos espumosos"]
)
quiz_q(
    "Lors de la navigation d'une carte des vins, vous devriez d'abord demander:",
    "Al navegar una carta de vinos, primero debes preguntar:",
    '["Leur budget","Leur style de vin préféré","Leur nationalité","Combien de verres ils boiront"]',
    ["Su presupuesto","Su estilo de vino preferido","Su nacionalidad","Cuántas copas beberán"]
)

# ======================================================
# MODULE 12 — Leadership
# ======================================================
lesson(
    "Leadership au niveau du sol",
    "Liderazgo a Nivel de Piso",
    "Le leadership n'est pas un titre — c'est un comportement.",
    "El liderazgo no es un título — es un comportamiento. Los mejores líderes de piso dan el ejemplo constantemente: son los primeros en ayudar cuando alguien está ocupado, los más calmados bajo presión, los más conocedores del menú. Tu comportamiento establece el estándar para todos los que te rodean."
)
lesson(
    "Briefings pré-service efficaces",
    "Briefings Pre-Servicio Efectivos",
    "Un bon briefing dure 5 minutes et couvre tout l'essentiel.",
    "Un buen briefing dura 5 minutos y cubre todo lo esencial: especiales del día, artículos agotados, VIPs esperados, situaciones especiales y un punto de aprendizaje. Un mesero que conoce la información antes del servicio sirve con confianza. Un mesero que descubre todo en la marcha sirve con ansiedad."
)
lesson(
    "Former & encadrer le nouveau personnel",
    "Formar y Supervisar al Nuevo Personal",
    "Votre façon de former quelqu'un révèle votre propre niveau de maîtrise.",
    "La forma en que formas a alguien revela tu propio nivel de maestría. Los mejores formadores son pacientes, específicos y positivos. Usa turnos de sombra con debrief después de cada sección. Explica el por qué detrás de cada estándar — el personal que entiende el propósito lo cumple con más convicción."
)
lesson(
    "Naviguer les dynamiques d'équipe",
    "Navegar las Dinámicas de Equipo",
    "Un bon serveur construit des relations avec tout le personnel, pas seulement ses pairs.",
    "Un buen mesero construye relaciones con todo el personal, no solo con sus pares. El cocinero que te conoce te prioriza en un momento de caos. El portero que te respeta te ayuda con los clientes difíciles. Las relaciones laborales sólidas son un activo profesional que tarda años en construirse y segundos en dañarse."
)
lesson(
    "Gérer le stress & l'épuisement professionnel",
    "Gestionar el Estrés y el Agotamiento Profesional",
    "L'épuisement professionnel est réel dans l'hôtellerie — reconnaissez-le tôt.",
    "El agotamiento profesional es real en hostelería — reconócelo temprano. Las señales: irritabilidad constante, falta de entusiasmo, errores frecuentes. Los remedios: vacaciones regulares, límites saludables, actividades fuera del trabajo. Cuídate como si tu carrera dependiera de ello — porque así es."
)
lesson(
    "Certifications & développement professionnel",
    "Certificaciones y Desarrollo Profesional",
    "Les meilleurs serveurs investissent dans leur éducation en dehors du travail.",
    "Los mejores meseros invierten en su educación fuera del trabajo. WSET para vinos y destilados, ServSafe para seguridad alimentaria, cursos de coctelería, sommellería certificada — cada credencial amplía tu valor y tu potencial de ingresos. El conocimiento es el activo profesional que nadie puede quitarte."
)
lesson(
    "Progresser vers des postes de direction",
    "Progresar hacia Puestos Directivos",
    "La transition de serveur à manager est une progression naturelle.",
    "La transición de mesero a gerente es una progresión natural para quienes dominan tanto las habilidades técnicas como las interpersonales. Aprende las operaciones de cocina básicas, gestión de inventarios, contratación y programación. Pide mentoría activa del gerente actual. El mesero que entiende cada rol en el establecimiento se convierte en el gerente que gana el respeto del equipo al instante."
)
lesson(
    "Ouvrir votre propre restaurant",
    "Abrir tu Propio Restaurante",
    "Le serveur qui comprend chaque rôle dans l'établissement devient l'opérateur qui gagne instantanément le respect de l'équipe.",
    "Muchos de los grandes restauradores del mundo comenzaron como meseros. Si la propiedad es tu objetivo, adquiere experiencia en cada departamento — bases de cocina, gestión de sala, compras y finanzas. Escribe un concepto y un plan de negocio mientras sigues empleado. El mesero que entiende cada rol en el establecimiento se convierte en el operador que gana instantáneamente el respeto del equipo."
)

# MODULE 12 QUIZ
quiz_q(
    "Un briefing pré-service doit couvrir:",
    "Un briefing pre-servicio debe cubrir:",
    '["Seulement les spéciaux","Spéciaux, articles épuisés, VIP et un point d\'apprentissage","Les plaintes du personnel","Rien — perte de temps"]',
    ["Solo los especiales","Especiales, artículos agotados, VIPs y un punto de aprendizaje","Quejas del personal","Nada — pérdida de tiempo"]
)
quiz_q(
    "Le meilleur investissement dans votre carrière hôtelière est:",
    "La mejor inversión en tu carrera hotelera es:",
    '["Acheter de meilleures chaussures","La formation et les certifications","Travailler plus d\'heures","Mémoriser les menus"]',
    ["Comprar mejores zapatos","La formación y las certificaciones","Trabajar más horas","Memorizar los menús"]
)
quiz_q(
    "La façon la plus efficace de former le nouveau personnel est:",
    "La forma más efectiva de formar al nuevo personal es:",
    '["Leur remettre le manuel du personnel","Des services en ombre avec débriefing après chaque section","Leur demander de regarder des vidéos","Les associer à un autre nouveau membre du personnel"]',
    ["Entregarles el manual del personal","Turnos de sombra con debrief después de cada sección","Pedirles que vean videos","Emparejarlos con otro miembro nuevo del personal"]
)
quiz_q(
    "La qualification WSET est associée à:",
    "La calificación WSET está asociada con:",
    '["Certification de sécurité alimentaire","Formation en vins et spiritueux","Gestion hôtelière","Compétences culinaires"]',
    ["Certificación de seguridad alimentaria","Formación en vinos y destilados","Gestión hotelera","Habilidades culinarias"]
)
quiz_q(
    "Le leadership en salle est principalement démontré par:",
    "El liderazgo en sala se demuestra principalmente mediante:",
    '["Avoir le plus d\'ancienneté","Un comportement constamment excellent et aider les collègues","Dire aux autres quoi faire","Éviter les situations difficiles"]',
    ["Tener la mayor antigüedad","Comportamiento constantemente excelente y ayudar a los colegas","Decirle a otros qué hacer","Evitar las situaciones difíciles"]
)

print(f"Applied {count[0]} lesson/quiz changes.")
with open('app.html', 'w', encoding='utf-8') as f:
    f.write(c)
print("File written.")
