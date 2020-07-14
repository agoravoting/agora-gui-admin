/**
 * This file is part of agora-gui-admin.
 * Copyright (C) 2015-2016  Agora Voting SL <agora@agoravoting.com>

 * agora-gui-admin is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License.

 * agora-gui-admin  is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.

 * You should have received a copy of the GNU Affero General Public License
 * along with agora-gui-admin.  If not, see <http://www.gnu.org/licenses/>.
**/

angular.module('avAdmin')
    .factory(
      'ElectionsApi',
      function(
        $q,
        Plugins,
        Authmethod,
        ConfigService,
        AdminProfile,
        $i18next,
        $http,
        $cookies,
        localStorageService,
        $rootScope)
      {

        /**
         * Generates a saved election key for the local storage key value store
         * in a secure way: the key is a cryptographically secure id, stored
         * as a cookie.
         */
        function getSavedElectionKey() {
          var autheventid = Authmethod.getAuthevent();
          var postfix = "_authevent_" + autheventid;
          if (!$cookies["savedElectionKey" + postfix]) {
            /* jshint ignore:start */
            $cookies["savedElectionKey" + postfix] = "savedElectionKey_" + sjcl.codec.base64.fromBits(sjcl.random.randomWords(8, 0));
            /* jshint ignore:end */
          }

          return $cookies["savedElectionKey" + postfix];
        }

        /**
         * Return the saved election in local storage if it exists or null.
         */
        function getSavedElection() {
          return JSON.parse(
            localStorageService.get(
              getSavedElectionKey()));
        }

        /**
         * Saves locally the election into local storage.
         */
        function localSaveElection(election) {
          localStorageService.set(
            getSavedElectionKey(),
            JSON.stringify(election));
        }

        /**
         * Return boolean that specifies if there's any saved election in local
         * storage.
         */
        function hasSavedElection() {
          return !!localStorageService.get(
              getSavedElectionKey());
        }

        var backendUrl = ConfigService.electionsAPI;
        var electionsapi = {cache: {}, permcache: {}};
        electionsapi.waitingCurrent = [];
        electionsapi.currentElection = {};

        electionsapi.currentElections = [];
        electionsapi.newElection = false;

        electionsapi.waitForCurrent = function(f) {
            if (electionsapi.currentElection.id || electionsapi.newElection) {
                f();
            } else {
                electionsapi.waitingCurrent.push(f);
            }
        };

        electionsapi.setCurrent = function(el) {
            electionsapi.currentElection = el;
            electionsapi.newElection = !el.id;

            Plugins.hook('elections-api-set-current', {election: el , rootScope: $rootScope});

            $rootScope.currentElection = el;
            if (!$rootScope.watchingElection) {
                $rootScope.$watch('currentElection', function(newv, oldv) {
                  Plugins.hook('election-modified', {old: oldv, el: newv, rootScope: $rootScope});
                  if (!$rootScope.currentElection.id) {
                    localSaveElection($rootScope.currentElection);
                  }
                }, true);
                $rootScope.watchingElection = true;
            }

            electionsapi.waitingCurrent.forEach(function(f) {
                f();
            });
            electionsapi.waitingCurrent = [];
        };

        if (hasSavedElection()) {
            try {
                var el = getSavedElection();
                console.log(getSavedElection());
                electionsapi.setCurrent(el);
            } catch (e) {
                localSaveElection(electionsapi.currentElection);
            }
        }


        function asyncElection(id) {
            var deferred = $q.defer();

            electionsapi.election(id)
                .then(
                  function onSuccess(response) {
                    var el = electionsapi.parseElection(response.data);
                    deferred.resolve(el);
                  },
                  deferred.reject
                );

            return deferred.promise;
        }

        function processElectionAuth(el, electionAuth) 
        {
          var deferred = $q.defer();
          el.auth = {};
          el.auth.authentication = electionAuth.auth_method;
          el.auth.census = electionAuth.users;
          el.raw = electionAuth;
          if (el.auth.census && electionAuth.total_votes) {
              el.votes = electionAuth.total_votes;
              el.votes_percentage = ( electionAuth.total_votes * 100 ) / el.auth.census;
          } else {
              el.votes_percentage = 0;
              el.votes = el.stats.total_votes || 0;
          }

          // updating census
          el.census.auth_method = electionAuth.auth_method;
          el.census.has_ballot_boxes = electionAuth.has_ballot_boxes;

          el.children_election_info = electionAuth.children_election_info;
          el.children_tally_status = electionAuth.children_tally_status;
          el.parent_id = electionAuth.parent_id;
          el.hide_default_login_lookup_field = electionAuth.hide_default_login_lookup_field;
          el.allow_public_census_query = electionAuth.allow_public_census_query;

          el.census.extra_fields = electionAuth.extra_fields;
          el.census.admin_fields = electionAuth.admin_fields;
          el.census.census = electionAuth.census;
          if(!!electionAuth.num_successful_logins_allowed || 0 === electionAuth.num_successful_logins_allowed) {
            el.num_successful_logins_allowed = electionAuth.num_successful_logins_allowed;
          }

          var newConf = electionAuth.auth_method_config.config;
          // not updating msgs if are modified
          if (el.census.config && el.census.config.msg) {
              newConf.msg = el.census.config.msg;
              newConf.subject = el.census.config.subject;
          }
          el.census.config = newConf;

          // make it easy to get children election' names
          el.childrenElectionNames = {};
          if (el.children_election_info) {
            _.each(
              el.children_election_info.presentation.categories,
              function (category) {
                _.each(
                  category.events,
                  function (election) {
                    el.childrenElectionNames[election.event_id] = election.title;
                  }
                );
              }
            );
          }

          deferred.resolve(el);
        }

        function asyncElectionAuth(el) {
            var deferred = $q.defer();

            Authmethod.viewEvent(el.id)
                .then(
                  function onSuccess (response) {
                    processElectionAuth(el, response.data.events);
                    deferred.resolve(el);
                  }
                )
                .catch(deferred.reject);

            return deferred.promise;
        }

        electionsapi.cache_election = function(id, election) {
            electionsapi.cache[id] = election;
        };

        electionsapi.getElection = function(id, ignorecache, electionAuth) {
            var deferred = $q.defer();

            var cached = electionsapi.cache[id];
            if (ignorecache || !cached) {
                if (!electionAuth) {
                  asyncElection(id)
                    .then(asyncElectionAuth)
                    .then(deferred.resolve)
                    .catch(deferred.reject);
                } else {
                  asyncElection(id)
                    .then(
                      function (el) {
                        processElectionAuth(el, electionAuth);
                        deferred.resolve(el);
                      }
                    )
                    .catch(deferred.reject);
                }
            } else {
                deferred.resolve(cached);
            }

            return deferred.promise;
        };

        electionsapi.election = function(id) {
            return $http.get(backendUrl + 'election/'+id);
        };

        electionsapi.parseElection = function(d) {
            var election = d.payload;
            var conf = electionsapi.templateEl();
            conf = _.extend(conf, election.configuration);
            conf.status = election.state;
            conf.stats = {};
            conf.results = {};
            conf.tallyAllowed = election.tallyAllowed;
            if (election.resultsConfig) {
              conf.resultsConfig = election.resultsConfig;
            }

            conf.votes = 0;
            conf.votes_percentage = 0;

            // number of answers
            conf.answers = 0;
            conf.questions.forEach(function(q) {
                conf.answers += q.answers.length;
            });

            // adding director to the list of authorities
            conf.auths = [conf.director, ];
            conf.authorities.forEach(function(a) { conf.auths.push(a); });

            // results
            if (election.results) {
                conf.results = angular.fromJson(election.results);
            }

            // extra_data
            if (!conf.extra_data) {
                conf.extra_data = {};
            } else if (typeof conf.extra_data === 'string') {
                conf.extra_data = JSON.parse(conf.extra_data);
            }

            // caching election
            electionsapi.cache[conf.id] = conf;
            return conf;
        };

        electionsapi.getCachedEditPerm = function(id) {
            return electionsapi.permcache[id];
        };

        electionsapi.getEditPerm = function(id) {
            var deferred = $q.defer();

            var cached = electionsapi.permcache[id];
            if (!cached) {
                Authmethod.getPerm(
                    "edit|create|register|update|update-share|view|delete|send-auth|send-auth-all|view-results|view-stats|view-voters|view-census|start|stop|allow-tally|tally|calculate-results|publish-results|census-add|census-delete|census-activation|add-ballot-boxes|list-ballot-boxes|delete-ballot-boxes|add-tally-sheets|override-tally-sheets|list-tally-sheets|delete-tally-sheets|archive|unarchive",
                    "AuthEvent",
                    id
                )
                .then(function onSuccess(response) {
                  var perm = response.data['permission-token'];
                  electionsapi.permcache[id] = perm;
                  deferred.resolve(perm);
                });
            } else {
                deferred.resolve(cached);
            }

            return deferred.promise;
        };

        electionsapi.voteStats = function(election) 
        {
          var deferred = $q.defer();

          Authmethod
            .voteStats(election.id)
            .then(
                function(response) 
                {
                election.stats = response.data;
                deferred.resolve(election);
              }
            )
            .catch(deferred.reject);

            return deferred.promise;
        };

        electionsapi.autoreloadStatsTimer = null;
        electionsapi.autoreloadStats = function(electionId, callback) 
        {
          clearTimeout(electionsapi.autoreloadStatsTimer);
          if (!electionId) 
          {
            return;
          }

          electionsapi.getElection(electionId, true)
            .then(
              function (el) 
              {
                var deferred = $q.defer();
                if (!!callback) 
                {
                  callback(el);
                }
                deferred.resolve(el);
                return deferred.promise;
              }
              )
              .then(electionsapi.results)
            .finally(
              function() 
              {
                electionsapi.autoreloadStatsTimer = setTimeout(
                  function() {
                    electionsapi.autoreloadStats(electionId, callback); 
                  }, 
                  5000
                );
              }
            );
        };

        electionsapi.results = function(el) 
        {
          var deferred = $q.defer();

          electionsapi
            .command(el, 'results', 'GET')
            .then(
              function(response)
              {
                el.results = angular.fromJson(response.data.payload);
                deferred.resolve(el);
              }
            )
            .catch(deferred.reject);

          return deferred.promise;
        };

        electionsapi.unpublishResults = function(el) 
        {
          return electionsapi.command(el, 'unpublish-results', 'POST');
        };

        electionsapi.allowTally = function(el) 
        {
          return electionsapi.command(el, 'allow-tally', 'POST');
        };

        electionsapi.command = function(el, command, method, data) 
        {
            var deferred = $q.defer();
            var m = {};
            var d = data || {};
            var url = backendUrl + 'election/'+el.id;

            if (command) {
                url += '/'+command;
            }

            electionsapi.getEditPerm(el.id)
                .then(function(perm) {
                    if (method === "POST") {
                        m = $http.post(url, data, {headers: {'Authorization': perm}});
                    } else {
                        m = $http.get(url, {headers: {'Authorization': perm}});
                    }

                    m.then(deferred.resolve, deferred.reject);
                });

            return deferred.promise;
        };

        electionsapi.templateEl = function() {
            function getShareTextDefault() {
              var ret = angular.copy(ConfigService.share_social.default);
              if(!!ret) {
                _.map(ret, function(q) { q.active = false; });
                if (ret.length > 0) {
                  ret[0].active = true;
                }
              }
              return ret;
            }

            function evalElectionTemplate() {
                /* jshint ignore:start */
              return eval("(function(){ return" + ConfigService.electionTemplate +";})()");
                /* jshint ignore:end */
            }
            var el = (angular.isString(ConfigService.electionTemplate)? evalElectionTemplate(): ConfigService.electionTemplate);
            Plugins.hook('elections-api-template-el', {'el': el});
            return el;
        };

        electionsapi.templateQ = function(title) {
            var q = {
                "answer_total_votes_percentage": "over-total-valid-votes",
                "answers": [
                  {
                    "category": "",
                    "details": "This is an option with a simple example description.",
                    "id": 0,
                    "sort_order": 0,
                    "text": "Example option 1",
                    "urls": [
                      {
                        "title": "URL",
                        "url": ""
                      },
                      {
                        "title": "Image URL",
                        "url": ""
                      }
                    ]
                  },
                  {
                    "category": "",
                    "details": "An option can contain a description. You can add simple html like <strong>bold</strong> or <a href=\"https://nvotes.com\">links to websites</a>. You can also set an image url below, but be sure it's HTTPS or else it won't load.\n\n<br><br>You need to use two br element for new paragraphs.",
                    "id": 1,
                    "sort_order": 1,
                    "text": "Example option 2",
                    "urls": [
                      {
                        "title": "URL",
                        "url": "https://nvotes.com"
                      },
                      {
                        "title": "Image URL",
                        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/The_Fabs.JPG/220px-The_Fabs.JPG"
                      }
                    ]
                  }
                ],
                "description": "This is the description of this question. You can have multiple questions. You can add simple html like <strong>bold</strong> or <a href=\"https://nvotes.com\">links to websites</a>.\n\n<br><br>You need to use two br element for new paragraphs.",
                "layout": "accordion",
                "max": 1,
                "min": 1,
                "num_winners": 1,
                "tally_type": "plurality-at-large",
                "title": title,
                "extra_options": {
                  "shuffle_categories": true,
                  "shuffle_all_options": true,
                  "shuffle_category_list": [],
                  "show_points": false
                }
            };
            return q;
        };

        electionsapi.getCensus = function(election, page, size, filterStr, filterOptions) {
          var deferred = $q.defer();

          if (size === 'max') {
            size = 200;
          } else if (angular.isNumber(size) && size > 0 && size < 200) {
            size = parseInt(size);
          } else {
            size = 10;
          }

          var electionNames = {};

          // if there's a parent election, add those fields at the end of the example
          if (election.children_election_info) {
            _.each(
              election.children_election_info.presentation.categories,
              function (category) {
                _.each(
                  category.events,
                  function (election) {
                    electionNames[election.event_id] = election.title;
                  }
                );
              }
            );
          }
    
          function childrenElectionNames(children_event_id_list) {
            if (!children_event_id_list) {
              return [];
            } else {
              return _.map(
                children_event_id_list,
                function (electionId) {
                  return electionNames[electionId] || electionId;
                }
              );
            }
          }

          var params = {};

          if (!angular.isNumber(page)) {
            page = 1;
          }
          params.page = page;
          params.n = size;
          _.extend(params, filterOptions);
          if (filterStr && filterStr.length > 0) {
            params.filter = filterStr;
          }

          Authmethod.getCensus(election.id, params)
            .then(
              function onSuccess(response) 
              {
                if (!angular.isArray(election.census.voters)) {
                  election.census.voters = [];
                }
                _.each(response.data.object_list, function (user) {
                  user.selected = false;
                  if (user.metadata.children_event_id_list) {
                    user.childrenElectionNames = childrenElectionNames(user.metadata.children_event_id_list);
                  }
                  if (user.voted_children_elections) {
                    user.votedChildrenElectionNames = childrenElectionNames(user.voted_children_elections);
                  }
                  election.census.voters.push(user);
                });
                election.data = response.data;
                deferred.resolve(election);
              },
              deferred.reject
            );
          return deferred.promise;
        };

        electionsapi.updateShare = function(election, share) {
          var deferred = $q.defer();

          var share_text = angular.copy(share);
          share_text.forEach( function(v) { delete v.active; });

          electionsapi.command(election, 'update-share', 'POST', share_text)
            .then(function() {
              return electionsapi.getElection(election.id, true);
            })
            .then(function (el) {
               if(!angular.equals(share_text, el.presentation.share_text)) {
                throw "Error: share_text not correctly updated";
               }
            })
            .then(deferred.resolve)
            .catch(deferred.reject);

          return deferred.promise;
        };

        return electionsapi;
    });
