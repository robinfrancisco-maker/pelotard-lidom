const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir la carpeta publica con el index.html
app.use(express.static('public'));

let lidomLiveData = {
    games: [],
    lastUpdated: null
};

// MÓDULO DE AUTOCONEXIÓN A LA API OFICIAL DE LIDOM / MLB
async function syncLidomGames() {
    try {
        console.log('🔄 Conectando a la API de LIDOM...');
        
        // Fecha actual en formato YYYY-MM-DD
        const todayStr = new Date().toISOString().split('T')[0];
        
        // ID de la Liga Dominicana en la API Stats de MLB: 132
        const apiUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=132&date=${todayStr}&hydrate=team,linescore,flags`;

        const response = await axios.get(apiUrl, { timeout: 10000 });
        const dates = response.data.dates;

        let fetchedGames = [];

        if (dates && dates.length > 0) {
            const gamesList = dates[0].games;

            gamesList.forEach((g) => {
                const awayAbbr = g.teams.away.team.abbreviation || 'VIS';
                const homeAbbr = g.teams.home.team.abbreviation || 'LOC';
                const awayRuns = g.linescore ? (g.linescore.teams.away.runs || 0) : 0;
                const homeRuns = g.linescore ? (g.linescore.teams.home.runs || 0) : 0;
                
                // Determinación del estado e inning
                let statusStr = 'SCHEDULED';
                let inningStr = 'POR COMENZAR';

                if (g.status.abstractGameState === 'Live') {
                    statusStr = 'LIVE';
                    const currentInning = g.linescore ? g.linescore.currentInning : 1;
                    const isTop = g.linescore ? g.linescore.isTopInning : true;
                    inningStr = `${isTop ? 'Alta' : 'Baja'} ${currentInning}º`;
                } else if (g.status.abstractGameState === 'Final') {
                    statusStr = 'FINAL';
                    inningStr = 'FINALIZADO';
                }

                // Hora local formateada
                const gameDate = new Date(g.gameDate);
                const timeStr = gameDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

                fetchedGames.push({
                    id: g.gamePk,
                    date: todayStr,
                    time: timeStr,
                    stadium: g.venue ? g.venue.name : 'Estadio LIDOM',
                    away: awayAbbr,
                    home: homeAbbr,
                    awayName: g.teams.away.team.name,
                    homeName: g.teams.home.team.name,
                    awayRuns: awayRuns,
                    homeRuns: homeRuns,
                    status: statusStr,
                    inning: inningStr,
                    awayPitcher: 'Por definir',
                    homePitcher: 'Por definir',
                    awayMl: 1.90,
                    homeMl: 1.90,
                    total: 8.5,
                    over: 1.90,
                    under: 1.90
                });
            });
        }

        if (fetchedGames.length > 0) {
            lidomLiveData.games = fetchedGames;
            lidomLiveData.lastUpdated = new Date().toLocaleTimeString('es-DO');
            
            // Emitir evento a todos los navegadores conectados
            io.emit('lidom_auto_update', lidomLiveData);
            console.log(`✅ Sincronizados ${fetchedGames.length} juegos de LIDOM a las ${lidomLiveData.lastUpdated}`);
        }
    } catch (error) {
        console.error('⚠️ Error consultando la API de LIDOM:', error.message);
    }
}

// Consultar la API cada 60 segundos
setInterval(syncLidomGames, 60 * 1000);

// Primera sincronización al arrancar el servidor
syncLidomGames();

io.on('connection', (socket) => {
    console.log('⚡ Usuario conectado al servidor:', socket.id);
    socket.emit('lidom_auto_update', lidomLiveData);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor corriendo en el puerto ${PORT}`));
