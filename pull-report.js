#!/usr/bin/env node

/**
 * Pull request notifications.
 */
var pkg = require("./package.json"),

  _ = require("underscore"),
  async = require("async"),
  program = require("commander"),
  iniparser = require("iniparser"),
  GitHubApi = require("github"),

  HOME_PATH = process.env.HOME,
  GIT_CONFIG_PATH = [HOME_PATH, ".gitconfig"].join("/"),
  GIT_CONFIG = iniparser.parseSync(GIT_CONFIG_PATH),
  ORGS = [
    "FormidableLabs",
    "WalmartLabs"
  ],
  USERS = [
    "eastridge",
    "ryan-roemer",
    "alexlande",
    "per-nilsson",
    "rgerstenberger"
  ],

  github;


// Get PRs for team.
function getPrs(org, callback) {
  // Actions.
  async.auto({
    repos: function (cb, results) {
      github.repos.getFromOrg({
        org: org,
        per_page: 100
      }, cb);
    },

    prs: ["repos", function (cb, results) {
      var repos = _.chain(results.repos)
        .map(function (repo) { return [repo.name, repo]; })
        .object()
        .value();

      async.each(results.repos, function (repo, mapCb) {
        github.pullRequests.getAll({
          user: org,
          repo: repo.name,
          state: "open",
          per_page: 100
        }, function (err, prs) {
          if (prs && prs.length) {
            delete prs.meta;
            repos[repo.name].prs = prs;
          }

          return mapCb(err, prs);
        });
      }, function (err) {
        return cb(err, repos);
      });
    }]


  }, function (err, results) {
    if (err) { return callback(err); }

    var repos = {};

    // Iterate Repos.
    _.chain(results.prs)
      .filter(function (repo) { return repo.prs && repo.prs.length; })
      .sort(function (repo) { return repo.name; })
      .map(function (repo) {
        var repoData = _.pick(repo, "name");

        // Iterate PRs.
        repoData.prs = _.chain(repo.prs)
          .sort(function (pr) { return pr.number; })
          .map(function (pr) {
            return {
              user: (pr.user ? pr.user.login : null),
              assignee: (pr.assignee ? pr.assignee.login : null),
              number: pr.number,
              title: pr.title
            };
          })
          .filter(function (pr) {
            // Limit to assigned / requesting users.
            return USERS.indexOf(pr.assignee) > -1 ||
                   USERS.indexOf(pr.user) > -1;
          })
          .value();

        // Add in repo if 1+ filtered PRs.
        if (repoData.prs.length > 0) {
          repos[repo.name] = repoData;
        }
      });

    callback(null, repos);
  });
}

// Main.
if (require.main === module) {
  // Parse command line arguments.
  program
    .version(pkg.version)
    .parse(process.argv);

  // Set up github auth.
  var github = new GitHubApi({
    // required
    version: "3.0.0",
    // optional
    timeout: 5000
  });

  // Authenticate.
  github.authenticate({
    type: "basic",
    username: GIT_CONFIG.github.user,
    password: GIT_CONFIG.github.password
  });

  // For each team,
  async.eachSeries(ORGS, function (team, cb) {
    console.log("* " + team);

    // for each repo,
    getPrs(team, function (err, repos) {
      _.each(repos, function (repo) {
        console.log("  * " + repo.name + ": (" + repo.prs.length + ")");

        // for each PR...
        _.each(repo.prs, function (pr) {
          console.log("    * " + pr.assignee + " / " + pr.user + " - " +
            pr.number + ": " + pr.title);
        });

        console.log("");
      });

      cb(err);
    }, function (err) {
      if (err) { throw err; }
    });
  });
}