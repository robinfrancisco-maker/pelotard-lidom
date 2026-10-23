app.post('/api/update-lidom', express.json(), (req, res) => {
    try {
        // 1. Procesar Standings si vienen en el body
        if (req.body && req.body.records) {
            let receivedStandings = [];
            req.body.records.forEach(record => {
                if (record.teamRecords) {
                    record.teamRecords.forEach(tr => {
                        const code = parseLidomCode(tr.team.name, tr.team.abbreviation);
                        if (code) {
                            receivedStandings.push({
                                code: code,
                                name: tr.team.name,
                                jj: (tr.wins || 0) + (tr.losses || 0),
                                g: tr.wins || 0,
                                p: tr.losses || 0,
                                pct: tr.winningPercentage || '.000',
                                dif: tr.gamesBack || '-',
                                u10: '0-0',
                                racha: tr.streak?.streakCode || '-',
                                ca: tr.runsScored || 0,
                                cp: tr.runsAllowed || 0,
                                difC: (tr.runsScored || 0) - (tr.runsAllowed || 0),
                                x1: '0-0', casa: '0-0', visita: '0-0', over500: '0-0'
                            });
                        }
                    });
                }
            });

            if (receivedStandings.length > 0) {
                lidomFullData.standings = receivedStandings;
            }
        }

        // 2. Procesar Cartelera si vienen eventos/fechas
        if (req.body && req.body.dates && req.body.dates[0]?.games) {
            let receivedGames = [];
            req.body.dates[0].games.forEach(g => {
                const awayCode = parseLidomCode(g.teams.away.team.name, g.teams.away.team.abbreviation);
                const homeCode = parseLidomCode(g.teams.home.team.name, g.teams.home.team.abbreviation);

                if (awayCode && homeCode) {
                    receivedGames.push({
                        id: g.gamePk,
                        date: g.gameDate.split('T')[0],
                        time: new Date(g.gameDate).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Santo_Domingo' }),
                        stadium: g.venue?.name || 'Estadio LIDOM',
                        away: awayCode,
                        home: homeCode,
                        awayName: g.teams.away.team.name,
                        homeName: g.teams.home.team.name,
                        awayRuns: g.teams.away.score || 0,
                        homeRuns: g.teams.home.score || 0,
                        status: g.status.abstractGameState.toUpperCase(),
                        inning: g.status.detailedState || 'POR COMENZAR',
                        awayPitcher: 'Por definir',
                        homePitcher: 'Por definir',
                        awayMl: 1.90, homeMl: 1.90, rlLine: 1.5, awayRl: 1.65, homeRl: 2.20, total: 8.5, over: 1.90, under: 1.90
                    });
                }
            });

            if (receivedGames.length > 0) {
                lidomFullData.games = receivedGames;
            }
        }

        lidomFullData.lastUpdated = new Date().toLocaleTimeString('es-DO', { 
            timeZone: 'America/Santo_Domingo',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        });

        // Guardar en disco y emitir a todos los navegadores conectados
        fs.writeFileSync(DATA_FILE, JSON.stringify(lidomFullData, null, 2));
        io.emit('lidom_auto_update', lidomFullData);

        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
