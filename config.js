module.exports = {
  /* 
    Require submitted levels to match at a bare minimum one of the following qualities and all subsequent qualities
    (e.g. "AVERAGE" == AVERAGE, GOOD, and AMAZING levels):
      "AWFUL"   -- the worst of the worst
      "BAD"     -- not really enjoyable
      "AVERAGE" -- the big catch all
      "GOOD"    -- well liked levels
      "AMAZING" -- best of the best
      false     -- no quality check made
  */
  minQuality: 'AVERAGE',

  // If `minQuality` is set to anything other than false,
  // can levels with no quality (ie no upvotes and downvotes, yet) be submitted
  naQuality: true,

  // Require submitters to be twitch subscribers
  subsOnly: false,

  // Whether the queue is open or not on application startup
  queueOpen: false,
};
