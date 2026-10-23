// Ruta para recibir los datos procesados desde GitHub Actions
app.post('/api/update-lidom', express.json(), (req, res) => {
    try {
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
                lidomFullData.lastUpdated = new Date().toLocaleTimeString('es-DO', { 
                    timeZone: 'America/Santo_Domingo',
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
                });
                
                io.emit('lidom_auto_update', lidomFullData);
                console.log('✅ Webhook: Standings de LIDOM actualizados exitosamente');
            }
        }
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
