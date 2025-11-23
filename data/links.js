// data/links.js
const links = [
  {
    "alias": "apna-tunnel",
    "original_url": "https://play.google.com/store/apps/details?id=com.apnatunnel.lite",
    "description": "Meu canal oficial!",
    "steps": 3 // Este link terá 3 etapas
  },
  {
    "alias": "arquivo-minapronet",
    "original_url": "https://www.mediafire.com/file/...",
    "description": "Arquivo MinaProNet",
    "steps": 5 // Este link será mais difícil, 5 etapas
  },
  {
    "alias": "projeto-botaviator",
    "original_url": "https://www.mediafire.com/...",
    "description": "Projeto Bot Aviator",
    "steps": 6 // Máxima segurança
  },
  // ... adicione "steps" nos outros conforme quiser.
  // Se não adicionar, o padrão será definido no index.js (ex: 3)
];

module.exports = links;