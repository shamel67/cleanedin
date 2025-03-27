/**
 * @file ai.js
 * @description [complete]
 * 
 * @author Stéphane Hamel
 * @repository https://github.com/shamel67/cleanedin
 */

// LinkedIn AI-generated post detection heuristic

function analyzeLinkedInPost(content) {
  let score = 0;

  // Heuristic thresholds (tune as needed)
  const thresholds = {
    sentenceVariance: 20,
    buzzwordDensity: 0.03,
    emDashDensity: 0.005,
    curlyQuoteRatio: 0.8,
    formulaicPhrases: 1,
    finalScore: 3
  };

  // 1. Sentence length uniformity
  const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
  const lengths = sentences.map(s => s.trim().split(/\s+/).length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;
  if (variance < thresholds.sentenceVariance) score += 1;

  // 2. Formulaic phrases
  const formulaicPatterns = [
    /here are \d+ (tips|ways|steps)/i,
    /what do you think/i,
    /comment below/i,
    /let's connect/i,
    /agree\?/i,
    /follow me/i
  ];
  let formulaicCount = formulaicPatterns.filter(pattern => pattern.test(content)).length;
  if (formulaicCount >= thresholds.formulaicPhrases) score += 1;

  // 3. Buzzword density
  const buzzwords = ['innovation', 'value', 'impact', 'journey', 'growth', 'synergy', 'passionate', 'community', 'transformation'];
  const words = content.toLowerCase().match(/\b\w+\b/g) || [];
  const buzzwordMatches = words.filter(word => buzzwords.includes(word)).length;
  if ((buzzwordMatches / words.length) > thresholds.buzzwordDensity) score += 1;

  // 4. Special typography detection
  const emDashCount = (content.match(/—/g) || []).length;
  if ((emDashCount / content.length) > thresholds.emDashDensity) score += 1;

  const curlyQuotesCount = (content.match(/[“”‘’]/g) || []).length;
  const straightQuotesCount = (content.match(/['"]/g) || []).length;
  const totalQuotes = curlyQuotesCount + straightQuotesCount;
  if (totalQuotes > 0 && (curlyQuotesCount / totalQuotes) > thresholds.curlyQuoteRatio) score += 1;

  // Final determination
  const isPotentiallyAI = score >= thresholds.finalScore;

  return {
    score,
    isPotentiallyAI,
    details: {
      sentenceVariance: variance,
      formulaicCount,
      buzzwordDensity: buzzwordMatches / words.length,
      emDashDensity: emDashCount / content.length,
      curlyQuoteRatio: totalQuotes > 0 ? curlyQuotesCount / totalQuotes : 0
    }
  };
}

// Example usage:
// const result = analyzeLinkedInPost("Here are 5 tips to improve your impact—follow me!");
// console.log(result);