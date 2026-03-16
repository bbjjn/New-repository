const fetch = require('node-fetch');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const API_KEY = process.env.API_FOOTBALL_KEY;
    if (!API_KEY) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    try {
        const today = new Date().toISOString().split('T')[0];
        
        // 只关注的联赛ID：英超39、西甲140、德甲78、意甲135、法甲61、世界杯1
        const TARGET_LEAGUES = [39, 140, 78, 135, 61, 1];
        
        // 获取今日所有比赛
        const fixturesRes = await fetch(
            `https://v3.football.api-sports.io/fixtures?date=${today}`,
            { headers: { 'x-apisports-key': API_KEY } }
        );
        
        if (!fixturesRes.ok) {
            return res.status(fixturesRes.status).json({ error: 'API request failed' });
        }

        const fixturesData = await fixturesRes.json();
        
        if (!fixturesData.response || fixturesData.response.length === 0) {
            return res.json({ matches: [] });
        }

        // 过滤出目标联赛的比赛
        const targetFixtures = fixturesData.response.filter(fixture => 
            TARGET_LEAGUES.includes(fixture.league.id)
        );

        // 获取预测数据（尝试）
        let predictionsMap = new Map();
        try {
            // 注意：predictions 接口可能需要付费，我们先尝试调用
            // 如果免费版不支持，这里会失败，但不影响主流程
            for (const fixture of targetFixtures) {
                const predRes = await fetch(
                    `https://v3.football.api-sports.io/predictions?fixture=${fixture.fixture.id}`,
                    { headers: { 'x-apisports-key': API_KEY } }
                );
                if (predRes.ok) {
                    const predData = await predRes.json();
                    if (predData.response && predData.response[0]) {
                        predictionsMap.set(fixture.fixture.id, predData.response[0]);
                    }
                }
                // 避免请求过快
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        } catch (e) {
            console.log('Predictions not available with free plan');
        }

        // 构建返回数据
        const matches = targetFixtures.map(fixture => {
            const fixtureId = fixture.fixture.id;
            const prediction = predictionsMap.get(fixtureId);
            
            // 提取预测信息（如果有）
            let predictionText = '暂无分析';
            let homeProb = '?', drawProb = '?', awayProb = '?';
            
            if (prediction) {
                // 预测结果
                const winner = prediction.predictions.winner;
                const winProb = prediction.predictions.winner_comment || '';
                predictionText = `预测: ${winner?.name || '未知'} 胜出 ${winProb}`;
                
                // 百分比概率
                const percent = prediction.predictions.percent || {};
                homeProb = percent.home || '?';
                drawProb = percent.draw || '?';
                awayProb = percent.away || '?';
            }

            return {
                league: fixture.league.name,
                leagueId: fixture.league.id,
                homeTeam: fixture.teams.home.name,
                awayTeam: fixture.teams.away.name,
                date: fixture.fixture.date,
                status: fixture.fixture.status.short,
                score: `${fixture.goals.home ?? 0} : ${fixture.goals.away ?? 0}`,
                // 赔率暂时无法获取，留空
                odds: { home: '-', draw: '-', away: '-' },
                // 预测分析
                prediction: predictionText,
                homeProb,
                drawProb,
                awayProb
            };
        });

        res.json({ matches });
    } catch (error) {
        console.error('Serverless function error:', error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
};
