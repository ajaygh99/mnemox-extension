// Mnemox - Prompt Improvement Suggester
// Generates a concrete rewritten prompt based on which rules are failing.
// 100% local. No API calls.

var MnemoxSuggester = (function () {

  function getPct(dim) {
    if (!dim) return 100;
    if (typeof dim === 'object' && dim.max) return (dim.score / dim.max) * 100;
    return dim * 100;
  }

  function suggest(text, dims) {
    if (!text || !dims) return null;

    var parts = { prefix: [], suffix: [] };

    if (getPct(dims.R1) < 50) {
      parts.prefix.push('You are an expert assistant.');
    }
    if (getPct(dims.R2) < 40) {
      parts.prefix.push('Please complete the following task:');
    }
    if (getPct(dims.R3) < 40) {
      parts.suffix.push('Provide relevant context and background in your response.');
    }
    if (getPct(dims.R4) < 50) {
      parts.suffix.push('Format your response clearly with sections and examples where helpful.');
    }
    if (getPct(dims.R5) < 50) {
      parts.suffix.push('Keep your response concise and focused.');
    }
    if (getPct(dims.R6) < 40) {
      parts.suffix.push('Please be thorough and detailed in your response.');
    }
    if (getPct(dims.R7) < 50) {
      parts.suffix.push('Target your response for a general professional audience.');
    }
    if (getPct(dims.R8) < 50) {
      parts.suffix.push('Be specific and precise in your answer.');
    }

    if (parts.prefix.length === 0 && parts.suffix.length === 0) return null;

    var improved = '';
    if (parts.prefix.length > 0) improved += parts.prefix.join(' ') + '\n\n';
    improved += text;
    if (parts.suffix.length > 0) improved += '\n\n' + parts.suffix.join(' ');

    return improved.trim();
  }

  return { suggest: suggest };
})();
