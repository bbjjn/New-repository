// 从API-Football获取今日比赛、实时比分、赔率、统计
const fetch = require('node-fetch');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const API_KEY = process.env.API_FOOTBALL_KEY;
    if (!API_KEY) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    try {
        const today = new Date().toISOString().split('T')[0];
        
        // 1. 获取今日所有比赛（包含实时比分）
        const fixturesRes = await fetch(
            `https://v3.football.api-sports.io/fixtures?date=${today}`,
            { headers: { 'x-apisports-key': API_KEY } }
        );
        const fixturesData = await fixturesRes.json();
        
        if (!fixturesData.response || fixturesData.response.length === 0) {
            return res.json({ matches: [] });
        }

        // 2. 获取今日比赛的赔率（使用另一个接口，免费版可能限制，我们只取第一场比赛的赔率做演示）
        // 注意：免费版可能不支持赔率接口，需要根据实际情况调整。如果不可用，可以暂时模拟显示。
        let oddsData = [];
        try {
            const oddsRes = await fetch(
                `https://v3.football.api-sports.io/odds?date=${today}`,
                { headers: { 'x-apisports-key': API_KEY } }
            );
            const oddsJson = await oddsRes.json();
            oddsData = oddsJson.response || [];
        } catch (e) {
            console.log('Odds API not available with free plan, using mock');
        }

        // 构建返回数据
        const matches = fixturesData.response.map(fixture => {
            const fixtureId = fixture.fixture.id;
            const homeTeam = fixture.teams.home.name;
            const awayTeam = fixture.teams.away.name;
            const league = fixture.league.name;
            const date = fixture.fixture.date;
            
            // 实时比分
            const score = fixture.goals;
            const status = fixture.fixture.status.short; // 'FT', 'LIVE', 'HT', etc.
            
            // 实时统计（如控球率、射门等）
            const stats = fixture.statistics || [];
            // 简化：提取控球率（如果有）
            let homePossession = 'N/A', awayPossession = 'N/A';
            stats.forEach(teamStat => {
                if (teamStat.team.id === fixture.teams.home.id) {
                    const possessionStat = teamStat.statistics.find(s => s.type === 'Ball Possession');
                    if (possessionStat) homePossession = possessionStat.value;
                } else {
                    const possessionStat = teamStat.statistics.find(s => s.type === 'Ball Possession');
                    if (possessionStat) awayPossession = possessionStat.value;
                }
            });

            // 赔率信息（从oddsData中匹配，这里简化处理）
            const matchOdds = oddsData.find(o => o.fixture.id === fixtureId);
            let odds = { home: '-', draw: '-', away: '-' };
            if (matchOdds && matchOdds.bookmakers && matchOdds.bookmakers[0]) {
                const bet = matchOdds.bookmakers[0].bets.find(b => b.name === 'Match Winner');
                if (bet) {
                    odds.home = bet.values.find(v => v.value === 'Home')?.odd || '-';
                    odds.draw = bet.values.find(v => v.value === 'Draw')?.odd || '-';
                    odds.away = bet.values.find(v => v.value === 'Away')?.odd || '-';
                }
            }

            return {
                fixtureId,
                league,
                homeTeam,
                awayTeam,
                date,
                status,
                score: `${score.home ?? 0} : ${score.away ?? 0}`,
                homePossession,
                awayPossession,
                odds
            };
        });

        res.json({ matches });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
};