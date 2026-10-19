/* LABYRINTHE — définition des 5 niveaux */
(function () {
  'use strict';
  const LH = window.LH;

  LH.CELL = 4;          // taille d'une cellule en unités monde
  LH.WALL_H = 2.9;      // hauteur des murs
  LH.WALL_T = 0.46;     // épaisseur des murs
  LH.PLAYER_R = 0.62;
  LH.MONSTER_R = 0.72;

  LH.LEVELS = [
    {
      id: 1,
      numeral: 'I',
      name: 'LA CAVE',
      subtitle: 'Sous la terre, personne ne t\'entend',
      story: 'Tu te réveilles sur un sol humide. Ta lampe torche tient encore. Trois ossements ont été volés ici — retrouve-les, puis trouve la sortie. Tu n\'as pas de carte. Seulement ta mémoire.',
      objective: 'Récupère 3 ossements, puis rejoins la sortie.',
      seed: 1187,
      cols: 15, rows: 15,
      braid: 0.62,
      memory: 19,
      reveal: 3.35,
      relics: 3,
      matches: 7,
      lampDrain: 0.85,
      escalation: 0,
      grace: 3.0,
      monsters: [
        { name: 'Le Rôdeur', chase: 4.75, patrol: 1.9, sight: 13, hear: 9.5, scale: 1.0 }
      ],
      scareEvery: [22, 38],
      screamEvery: [12, 24],
      whisperEvery: [28, 46],
      blackoutEvery: null,
      theme: {
        floor: 0x332a20, wall: 0x4b3d2c, fog: 0x050403,
        ambient: 0x6b5b45, ambientIntensity: 0.58,
        torch: 0xffb066, torchRange: 20, density: 0.0135,
        decor: 0x6a5a44, blood: 0x3a1410, face: 'cave'
      },
      ambience: { drone: 46, filter: 380, wind: 0.05 },
      whispers: [
        '...tu es déjà passé par ici...',
        '...ne regarde pas derrière toi...',
        '...les murs se souviennent de toi...',
        '...ta lampe ne te protégera pas...'
      ]
    },
    {
      id: 2,
      numeral: 'II',
      name: 'L\'ASILE',
      subtitle: 'Ici, les couloirs changent de place',
      story: 'Les néons clignotent au-dessus de couloirs carrelés. Deux silhouettes en blouse blanche arpentent l\'étage. Elles n\'ont plus de visage, mais elles t\'ont entendu arriver. Récupère les trois dossiers et fuis.',
      objective: 'Récupère 3 dossiers, puis rejoins la sortie.',
      seed: 4409,
      cols: 17, rows: 17,
      braid: 0.52,
      memory: 16,
      reveal: 3.0,
      relics: 3,
      matches: 6,
      lampDrain: 1.0,
      escalation: 0.03,
      grace: 3.0,
      monsters: [
        { name: 'L\'Infirmière', chase: 5.15, patrol: 2.3, sight: 15, hear: 11, scale: 1.02 },
        { name: 'L\'Autre', chase: 4.95, patrol: 2.1, sight: 14, hear: 12, scale: 0.98 }
      ],
      scareEvery: [18, 30],
      screamEvery: [14, 26],
      whisperEvery: [22, 38],
      blackoutEvery: [60, 90],
      theme: {
        floor: 0x26312c, wall: 0x67736a, fog: 0x040807,
        ambient: 0x7e9a8a, ambientIntensity: 0.62,
        torch: 0xd8f4e8, torchRange: 20, density: 0.015,
        decor: 0x8a978e, blood: 0x2c1717, face: 'asylum'
      },
      ambience: { drone: 58, filter: 620, wind: 0.08 },
      whispers: [
        '...chambre 13... chambre 13...',
        '...on t\'attend depuis longtemps...',
        '...prends tes cachets...',
        '...tu n\'es pas un patient...'
      ]
    },
    {
      id: 3,
      numeral: 'III',
      name: 'LA CHAPELLE',
      subtitle: 'Le chœur chante encore',
      story: 'Des cierges éteints, des bancs brisés, et sous la pierre, quelque chose qui chante faux. Les choristes n\'ont plus d\'yeux. Ils suivent ta lumière et hurlent quand ils te perdent. Quatre reliques, puis l\'autel.',
      objective: 'Récupère 4 reliques, puis rejoins la sortie.',
      seed: 7723,
      cols: 19, rows: 19,
      braid: 0.42,
      memory: 14,
      reveal: 2.85,
      relics: 4,
      matches: 6,
      lampDrain: 1.15,
      escalation: 0.04,
      grace: 2.6,
      monsters: [
        { name: 'Le Choriste', chase: 5.5, patrol: 2.5, sight: 16, hear: 12, scale: 1.04 },
        { name: 'La Mère', chase: 5.25, patrol: 2.3, sight: 15, hear: 13, scale: 1.12 },
        { name: 'L\'Enfant de chœur', chase: 5.8, patrol: 2.7, sight: 14, hear: 11, scale: 0.86 }
      ],
      scareEvery: [15, 26],
      screamEvery: [11, 22],
      whisperEvery: [18, 32],
      blackoutEvery: [50, 80],
      theme: {
        floor: 0x2b222b, wall: 0x564861, fog: 0x07040a,
        ambient: 0x7a5f86, ambientIntensity: 0.6,
        torch: 0xffb066, torchRange: 19, density: 0.016,
        decor: 0x8a7392, blood: 0x3c1618, face: 'chapel'
      },
      ambience: { drone: 52, filter: 500, wind: 0.06 },
      whispers: [
        '...libera me...',
        '...le chœur ne dort jamais...',
        '...tu chantes faux, toi aussi...',
        '...agenouille-toi...'
      ]
    },
    {
      id: 4,
      numeral: 'IV',
      name: 'LA CHAIR',
      subtitle: 'Le labyrinthe est vivant',
      story: 'Les murs sont tièdes. Ils respirent. Quatre écorchés rampent dans les boyaux de ce lieu, guidés par le bruit de ton cœur. Le sol se referme sur les souvenirs. Prends les quatre cœurs et atteins la plaie de sortie.',
      objective: 'Récupère 4 cœurs, puis rejoins la sortie.',
      seed: 9911,
      cols: 23, rows: 23,
      braid: 0.3,
      memory: 12,
      reveal: 2.55,
      relics: 4,
      matches: 5,
      lampDrain: 1.3,
      escalation: 0.05,
      grace: 2.4,
      monsters: [
        { name: 'L\'Écorché', chase: 5.9, patrol: 2.8, sight: 18, hear: 14, scale: 1.05 },
        { name: 'La Bouche', chase: 5.6, patrol: 2.5, sight: 16, hear: 15, scale: 1.15 },
        { name: 'Le Ver', chase: 6.0, patrol: 3.0, sight: 15, hear: 13, scale: 0.92 },
        { name: 'La Mue', chase: 5.7, patrol: 2.6, sight: 17, hear: 14, scale: 1.0 }
      ],
      scareEvery: [12, 22],
      screamEvery: [10, 20],
      whisperEvery: [16, 28],
      blackoutEvery: [40, 65],
      theme: {
        floor: 0x2d1114, wall: 0x5c2325, fog: 0x0a0102,
        ambient: 0x7d3c34, ambientIntensity: 0.56,
        torch: 0xff7a4a, torchRange: 18, density: 0.018,
        decor: 0x7b3a34, blood: 0x5a0f0f, face: 'flesh'
      },
      ambience: { drone: 38, filter: 300, wind: 0.09 },
      whispers: [
        '...on a faim...',
        '...reste avec nous...',
        '...ta chaleur nous appartient...',
        '...les murs ont des dents...'
      ]
    },
    {
      id: 5,
      numeral: 'V',
      name: 'L\'ABÎME',
      subtitle: 'Ce que tu oublies te dévore',
      story: 'Il n\'y a plus de plafond, seulement le vide. Cinq choses rampent dans le noir, et l\'une d\'elles voit à travers les murs. Ta mémoire ne tient plus que quelques secondes. Cinq éclats. Une sortie. Ne t\'arrête pas.',
      objective: 'Récupère 5 éclats, puis rejoins la sortie.',
      seed: 13337,
      cols: 27, rows: 27,
      braid: 0.2,
      memory: 9.5,
      reveal: 2.2,
      relics: 5,
      matches: 4,
      lampDrain: 1.5,
      escalation: 0.055,
      grace: 2.2,
      monsters: [
        { name: 'L\'Œil', chase: 6.35, patrol: 3.0, sight: 23, hear: 18, scale: 1.08, seer: true },
        { name: 'Le Rampant', chase: 6.0, patrol: 2.8, sight: 17, hear: 15, scale: 1.0 },
        { name: 'La Faim', chase: 6.15, patrol: 2.9, sight: 18, hear: 16, scale: 1.06 },
        { name: 'Le Sans-Nom', chase: 5.9, patrol: 2.6, sight: 16, hear: 14, scale: 0.96 },
        { name: 'La Chose', chase: 6.2, patrol: 3.1, sight: 19, hear: 17, scale: 1.12 }
      ],
      scareEvery: [8, 16],
      screamEvery: [8, 16],
      whisperEvery: [13, 24],
      blackoutEvery: [32, 52],
      theme: {
        floor: 0x171f2e, wall: 0x323e59, fog: 0x010206,
        ambient: 0x60789c, ambientIntensity: 0.66,
        torch: 0xa8ccff, torchRange: 18, density: 0.019,
        decor: 0x4b5f80, blood: 0x221122, face: 'abyss'
      },
      ambience: { drone: 33, filter: 240, wind: 0.12 },
      whispers: [
        '...tu m\'as déjà oublié...',
        '...regarde derrière toi...',
        '...je connais ton nom...',
        '...il ne reste rien...',
        '...reste. oublie. reste.'
      ]
    }
  ];

  // Textes de fin
  LH.ENDING = [
    'Tu as retrouvé la lumière. Mais quelque chose est remonté avec toi.',
    'La sortie s\'est refermée. Tu es libre. Ou tu crois l\'être.',
    'Le chant s\'est arrêté. Tu n\'entends plus que ton propre souffle.',
    'La chair s\'est refermée derrière toi. Tu es guéri. Personne ne te croira.',
    'L\'Abîme t\'a laissé partir. Il n\'oublie pas. Il attend.'
  ];

  LH.DIFFICULTY_LABEL = ['CALME', 'TENDU', 'HOSTILE', 'BRUTAL', 'INHUMAIN'];
})();
