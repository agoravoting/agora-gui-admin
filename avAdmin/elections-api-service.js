angular.module('avAdmin')
    .factory(
      'ElectionsApi',
      function(
        $q,
        AdminPlugins,
        Authmethod,
        ConfigService,
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
          if (!$cookies.savedElectionKey) {
            /* jshint ignore:start */
            $cookies.savedElectionKey = "savedElectionKey_" + sjcl.codec.base64.fromBits(sjcl.random.randomWords(8, 0));
            /* jshint ignore:end */
          }

          return $cookies.savedElectionKey;
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

            $rootScope.currentElection = el;
            if (!$rootScope.watchingElection) {
                $rootScope.$watch('currentElection', function(newv, oldv) {
                  AdminPlugins.hook('election-modified', {'old': oldv, 'el': newv});
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
                .success(function(data) {
                    var el = electionsapi.parseElection(data);
                    deferred.resolve(el);
                }).error(deferred.reject);

            return deferred.promise;
        }

        function asyncElectionAuth(el) {
            var deferred = $q.defer();

            Authmethod.viewEvent(el.id)
                .success(function(data) {
                    el.auth = {};
                    el.auth.authentication = data.events.auth_method;
                    el.auth.census = data.events.users;
                    el.raw = data.events;
                    if (el.auth.census) {
                        el.votes = el.stats.votes;
                        el.votes_percentage = ( el.stats.votes * 100 )/ el.auth.census;
                    } else {
                        el.votes_percentage = 0;
                        el.votes = el.stats.votes || 0;
                    }

                    // updating census
                    el.census.auth_method = data.events.auth_method;
                    el.census.extra_fields = data.events.extra_fields;
                    el.census.census = data.events.census;

                    var newConf = data.events.auth_method_config.config;
                    // not updating msgs if are modified
                    if (el.census.config && el.census.config.msg) {
                        newConf.msg = el.census.config.msg;
                        newConf.subject = el.census.config.subject;
                    }
                    el.census.config = newConf;

                    deferred.resolve(el);
                })
                .error(deferred.reject);

            return deferred.promise;
        }

        electionsapi.cache_election = function(id, election) {
            electionsapi.chache[id] = election;
        };

        electionsapi.getElection = function(id, ignorecache) {
            var deferred = $q.defer();

            var cached = electionsapi.cache[id];
            if (ignorecache || !cached) {
                asyncElection(id)
                  .then(electionsapi.stats)
                  .then(asyncElectionAuth)
                  .then(deferred.resolve)
                  .catch(deferred.reject);
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

        electionsapi.getEditPerm = function(id) {
            var deferred = $q.defer();

            var cached = electionsapi.permcache[id];
            if (!cached) {
                Authmethod.getPerm("edit", "AuthEvent", id)
                    .success(function(data) {
                        var perm = data['permission-token'];
                        electionsapi.permcache[id] = perm;
                        deferred.resolve(perm);
                    });
            } else {
                deferred.resolve(cached);
            }

            return deferred.promise;
        };

        electionsapi.stats = function(el) {
            var deferred = $q.defer();

            electionsapi.command(el, 'stats', 'GET')
                .then(function(d) {
                        el.stats = d.payload;
                        deferred.resolve(el);
                      })
                 .catch(deferred.reject);

            return deferred.promise;
        };

        electionsapi.autoreloadStatsTimer = null;
        electionsapi.autoreloadStats = function(el) {
            clearTimeout(electionsapi.autoreloadStatsTimer);
            if (!el) {
                return;
            }

            electionsapi.stats(el)
                .then(asyncElectionAuth)
                .finally(function() {
                    electionsapi.autoreloadStatsTimer = setTimeout(function() { electionsapi.autoreloadStats(el); }, 5000);
                });
        };

        electionsapi.results = function(el) {
            var deferred = $q.defer();

            electionsapi.command(el, 'results', 'GET')
                .then(function(d) {
                        el.results = angular.fromJson(d.payload);
                        deferred.resolve(el);
                      })
                 .catch(deferred.reject);

            return deferred.promise;
        };

        electionsapi.command = function(el, command, method, data) {
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

                    m.success(deferred.resolve).error(deferred.reject);
                });

            return deferred.promise;
        };

        electionsapi.templateEl = function() {
            var el = {
                title: $i18next('avAdmin.sidebar.newel'),
                description: "",
                start_date: "2015-01-27T16:00:00.001",
                end_date: "2015-01-27T16:00:00.001",
                authorities: ConfigService.authorities,
                director: ConfigService.director,
                presentation: {
                    theme: 'default',
                    share_text: '',
                    urls: [],
                    theme_css: ''
                },
                layout: 'simple',
                real: false,
                census: {
                    voters: [],
                    auth_method: 'email',
                    census:'close',
                    extra_fields: [ ],
                    config: {
                        "msg": $i18next('avAdmin.auth.emaildef'),
                        "subject": $i18next('avAdmin.auth.emailsubdef'),
                        "authentication-action": {
                          "mode": "vote",
                          "mode-config": {
                            "url": ""
                          }
                        },
                        "registration-action": {
                          "mode": "vote",
                          "mode-config": null
                        }
                    }
                },
                questions: [],
                extra_data: {}
            };
            return el;
        };

        electionsapi.templateQ = function(title) {
            var q = {
                "answer_total_votes_percentage": "over-total-valid-votes",
                "answers": [],
                "description": "",
                "layout": "accordion",
                "max": 1,
                "min": 1,
                "num_winners": 1,
                "randomize_answer_order": true,
                "tally_type": "plurality-at-large",
                "title": title
            };
            return q;
        };

        electionsapi.getCensus = function(el, page, size, filterStr, filterOptions) {
            var deferred = $q.defer();

            if (size === 'max') {
              size = 500;
            } else if (angular.isNumber(size) && size > 0 && size < 500) {
              size = parseInt(size);
            } else {
              size = 10;
            }

            function getAuthCensus(d) {
              var voters = d.payload;
              var deferred = $q.defer();
              var params = {};

              if (!angular.isNumber(page)) {
                page = 1;
              }
              params.page = page;
              params.size = size;
              _.extend(params, filterOptions);
              if (filterStr && filterStr.length > 0) {
                params.filter = filterStr;
              }

              Authmethod.getCensus(el.id, params)
                .success(function(data) {
                  _.each(data.object_list, function(user) {
                    user.vote = false;
                    if (voters.indexOf(user.username) >= 0) {
                      user.vote = true;
                    }
                  });
                  if (!angular.isArray(el.census.voters)) {
                    el.census.voters = [];
                  }
                  _.each(data.object_list, function (obj) {
                    obj.selected = false;
                    el.census.voters.push(obj);
                  });
                  el.data = data;
                  deferred.resolve(el);
                })
                .error(deferred.reject);
                return deferred.promise;
            }

            electionsapi.command(el, 'voters', 'GET')
                .then(getAuthCensus)
                .then(deferred.resolve)
                .catch(deferred.reject);

            return deferred.promise;
        };

        return electionsapi;
    });
