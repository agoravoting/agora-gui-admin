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
  .directive(
    'avAdminCreate',
    function(
      $q,
      Plugins,
      Authmethod,
      DraftElection,
      ElectionsApi,
      $state,
      $stateParams,
      $i18next,
      $filter,
      $modal,
      ConfigService,
      ElectionLimits,
      CheckerService,
      CsvLoad)
    {
      // we use it as something similar to a controller here
      function link(scope, element, attrs)
      {
        var adminId = ConfigService.freeAuthId;
        scope.creating = false;
        scope.log = '';
        scope.createElectionBool = true;
        scope.allowEditElectionJson = ConfigService.allowEditElectionJson;

        if (ElectionsApi.currentElections.length === 0 && !!ElectionsApi.currentElection) {
          scope.elections = [ElectionsApi.currentElection];
        } else {
          scope.elections = ElectionsApi.currentElections;
          ElectionsApi.currentElections = [];
        }

        function logInfo(text) {
          scope.log += "<p>" + text + "</p>";
        }

        function logError(text) {
          scope.log += "<p class=\"text-brand-danger\">" + text + "</p>";
        }
        function validateEmail(email) {
          var re = /^[^\s@]+@[^\s@.]+\.[^\s@.]+$/;
          return re.test(email);
        }

        /*
         * Checks elections for errors
         */
        var checks = [
          {
            check: "array-group-chain",
            prefix: "election-",
            append: {key: "eltitle", value: "$value.title"},
            checks: [
              {check: "is-array", key: "questions", postfix: "-questions"},
              {
                check: "array-length",
                key: "questions",
                min: 1,
                max: ElectionLimits.maxNumQuestions,
                postfix: "-questions"
              },
              {
                check: "array-length",
                key: "description",
                min: 0,
                max: ElectionLimits.maxLongStringLength,
                postfix: "-description"
              },
              {
                check: "array-length",
                key: "title",
                min: 0,
                max: ElectionLimits.maxLongStringLength,
                postfix: "-title"
              },
              {
                check: "is-string",
                key: "description",
                postfix: "-description"
              },
              {
                check: "lambda",
                key: "census",
                validator: function (census) {
                  var authAction = census.config['authentication-action'];
                  if (authAction.mode !== 'go-to-url') {
                    return true;
                  }

                  var urlRe = /^(https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?$/;
                  return urlRe.test(authAction['mode-config'].url);
                },
                postfix: "-success-action-url-mode"
              },
              {
                check: "lambda",
                key: "census",
                validator: function (census) {
                  if (census.auth_method !== 'email') {
                    return true;
                  }

                  return census.config.msg.length > 0;
                },
                appendOnErrorLambda: function (census) {
                 return {
                  min: 1,
                  len: census.config.msg.length
                 };
                },
                postfix: "-min-email-msg"
              },
              {
                check: "lambda",
                key: "census",
                validator: function (census) {
                  if (census.auth_method !== 'email') {
                    return true;
                  }

                  return census.config.msg.length <= 5000;
                },
                appendOnErrorLambda: function (census) {
                 return {
                  max: 5000,
                  len: census.config.msg.length
                 };
                },
                postfix: "-max-email-msg"
              },
              {
                check: "lambda",
                key: "census",
                validator: function (census) {
                  if (census.auth_method !== 'email') {
                    return true;
                  }

                  return census.config.subject.length > 0;
                },
                appendOnErrorLambda: function (census) {
                 return {
                  min: 1,
                  len: census.config.subject.length
                 };
                },
                postfix: "-min-email-title"
              },
              {
                check: "lambda",
                key: "census",
                validator: function (census) {
                  if (census.auth_method !== 'email') {
                    return true;
                  }

                  return census.config.subject.length <= 1024;
                },
                appendOnErrorLambda: function (census) {
                 return {
                  max: 1024,
                  len: census.config.subject.length
                 };
                },
                postfix: "-max-email-title"
              },
              {
                check: "lambda",
                key: "census",
                validator: function (census) {
                  if (census.auth_method !== 'sms') {
                    return true;
                  }

                  return census.config.msg.length > 0;
                },
                appendOnErrorLambda: function (census) {
                 return {
                  min: 1,
                  len: census.config.msg.length
                 };
                },
                postfix: "-min-sms-msg"
              },
              {
                check: "lambda",
                key: "census",
                validator: function (census) {
                  if (census.auth_method !== 'sms') {
                    return true;
                  }

                  return census.config.msg.length <= 200;
                },
                appendOnErrorLambda: function (census) {
                 return {
                  max: 200,
                  len: census.config.msg.length
                 };
                },
                postfix: "-max-sms-msg"
              },
              {check: "is-string", key: "title", postfix: "-title"},
              {
                check: "array-key-group-chain",
                key: "questions",
                append: {key: "qtitle", value: "$value.title"},
                prefix: "question-",
                checks: [
                  {check: "is-int", key: "min", postfix: "-min"},
                  {check: "is-int", key: "max", postfix: "-max"},
                  {
                    check: "is-int",
                    key: "num_winners",
                    postfix: "-num-winners"
                  },
                  {
                    check: "is-array",
                    key: "answers",
                    postfix: "-answers"
                  },
                  {
                    check: "array-length",
                    key: "answers",
                    min: 1,
                    max: ElectionLimits.maxNumAnswers,
                    postfix: "-answers"
                  },
                  {
                    check: "int-size",
                    key: "min",
                    min: 0,
                    max: "$value.max",
                    postfix: "-min"
                  },
                  {
                    check: "is-string",
                    key: "description",
                    postfix: "-description"
                  },
                  {
                    check: "array-length",
                    key: "description",
                    min: 0,
                    max: ElectionLimits.maxLongStringLength,
                    postfix: "-description"
                  },
                  {check: "is-string", key: "title", postfix: "-title"},
                  {
                    check: "array-length",
                    key: "title",
                    min: 0,
                    max: ElectionLimits.maxLongStringLength,
                    postfix: "-title"
                  },
                  {
                    check: "int-size",
                    key: "max",
                    min: "$value.min",
                    max: "$value.answers.length",
                    postfix: "-max"
                  },
                  {
                    check: "int-size",
                    key: "num_winners",
                    min: 1,
                    max: "$value.answers.length",
                    postfix: "-num-winners"
                  },
                  {
                      check: "array-key-group-chain",
                      key: "answers",
                      append: {key: "atext", value: "$value.text"},
                      prefix: "answer-",
                      checks: [
                        {
                          check: "is-string",
                          key: "text",
                          postfix: "-text"
                        },
                        {
                          check: "is-string",
                          key: "details",
                          postfix: "-details"
                        },
                        {
                          check: "is-string",
                          key: "category",
                          postfix: "-category"
                        },
                        {
                          check: "array-length",
                          key: "details",
                          min: 0,
                          max: ElectionLimits.maxLongStringLength,
                          postfix: "-details"
                        },
                        {
                          check: "array-length",
                          key: "text",
                          min: 1,
                          max: ElectionLimits.maxLongStringLength,
                          postfix: "-text"
                        },
                        {
                          check: "array-length",
                          key: "category",
                          min: 0,
                          max: ElectionLimits.maxShortStringLength,
                          postfix: "-category"
                        },
                      ]
                  }
                ]
              },
              {
                check: "object-key-chain",
                key: "census",
                prefix: "census-",
                append: {},
                checks: [
                  {
                    check: "is-array",
                    key: "admin_fields",
                    postfix: "-admin-fields"
                  },
                  {
                    check: "array-length",
                    key: "admin_fields",
                    min: 0,
                    max: ElectionLimits.maxNumQuestions,
                    postfix: "-admin-fields"
                  },
                  {
                    check: "lambda",
                    key: "admin_fields",
                    appendOnErrorLambda: function (admin_fields) {
                      var adminNames = [];
                      if (_.isArray(admin_fields)) {
                        _.each(
                          admin_fields,
                          function (field) {
                            if ('int' === field.type &&
                                !_.isNumber(field.value)) {
                              var field_name = field.name;
                              if (_.isString(field.label) &&
                                  0 < field.label.length) {
                                field_name = field.label;
                              }
                              adminNames.push(field_name);
                            }
                          });
                      }
                      return {"admin_names": adminNames.join(", ")};
                    },
                    validator: function (admin_fields) {
                      if (_.isArray(admin_fields)) {
                        return _.every(
                          admin_fields,
                          function (field) {
                            return ('int' !== field.type ||
                                     _.isNumber(field.value));
                          });
                      }
                      return true;
                    },
                    postfix: "-admin-fields-int-type-value"
                  },
                  {
                    check: "lambda",
                    key: "admin_fields",
                    appendOnErrorLambda: function (admin_fields) {
                      var adminNames = [];
                      if (_.isArray(admin_fields)) {
                        _.each(
                          admin_fields,
                          function (field) {
                            if ('email' === field.type &&
                                _.isString(field.value) &&
                                !validateEmail(field.value)) {
                              var field_name = field.name;
                              if (_.isString(field.label) &&
                                  0 < field.label.length) {
                                field_name = field.label;
                              }
                              adminNames.push(field_name);
                            }
                          });
                      }
                      return {"admin_names": adminNames.join(", ")};
                    },
                    validator: function (admin_fields) {
                      if (_.isArray(admin_fields)) {
                        return _.every(
                          admin_fields,
                          function (field) {
                            if ('email' === field.type &&
                                !_.isUndefined(field.value) &&
                                _.isString(field.value)) {
                              return validateEmail(field.value);
                            }
                            return true;
                          });
                      }
                      return true;
                    },
                    postfix: "-admin-fields-email-type-value"
                  },
                  {
                    check: "lambda",
                    key: "admin_fields",
                    appendOnErrorLambda: function (admin_fields) {
                      var adminNames = [];
                      if (_.isArray(admin_fields)) {
                        _.each(
                          admin_fields,
                          function (field) {
                            if ('text' === field.type &&
                                !_.isString(field.value)) {
                              var field_name = field.name;
                              if (_.isString(field.label) &&
                                  0 < field.label.length) {
                                field_name = field.label;
                              }
                              adminNames.push(field_name);
                            }
                          });
                      }
                      return {"admin_names": adminNames.join(", ")};
                    },
                    validator: function (admin_fields) {
                      if (_.isArray(admin_fields)) {
                        return _.every(
                          admin_fields,
                          function (field) {
                            return ('text' !== field.type ||
                                     _.isString(field.value));
                          });
                      }
                      return true;
                    },
                    postfix: "-admin-fields-string-type-value"
                  },
                  {
                    check: "lambda",
                    key: "admin_fields",
                    appendOnErrorLambda: function (admin_fields) {
                      var adminNames = [];
                      if (_.isArray(admin_fields)) {
                        _.each(
                          admin_fields,
                          function (field) {
                              if (_.isUndefined(field.value) ||
                                  (('text' === field.type ||
                                    'email' === field.type) &&
                                  _.isString(field.value) &&
                                  0 === field.value.length)) {
                              var field_name = field.name;
                              if (_.isString(field.label) &&
                                  0 < field.label.length) {
                                field_name = field.label;
                              }
                              adminNames.push(field_name);
                            }
                          });
                      }
                      return {"admin_names": adminNames.join(", ")};
                    },
                    validator: function (admin_fields) {
                        if (_.isArray(admin_fields)) {
                          return _.every(
                            admin_fields,
                            function (field) {
                              if (true === field.required) {
                                if (_.isUndefined(field.value) ||
                                     (('text' === field.type ||
                                       'email' === field.type) &&
                                       _.isString(field.value) &&
                                       0 === field.value.length)) {
                                  return false;
                                }
                              }
                              return true;
                            });
                        }
                        return true;
                    },
                    postfix: "-admin-fields-required-value"
                  },
                  {
                    check: "lambda",
                    key: "admin_fields",
                    append: {key: "max", value: ElectionLimits.maxLongStringLength},
                    appendOnErrorLambda: function (admin_fields) {
                      var adminNames = [];
                      if (_.isArray(admin_fields)) {
                        _.each(
                          admin_fields,
                          function (field) {
                              if ('text' === field.type &&
                                   _.isString(field.value) &&
                                   (field.value.length > ElectionLimits.maxLongStringLength)) {
                              var field_name = field.name;
                              if (_.isString(field.label) &&
                                  0 < field.label.length) {
                                field_name = field.label;
                              }
                              adminNames.push(field_name);
                            }
                          });
                      }
                      return {"admin_names": adminNames.join(", ")};
                    },
                    validator: function (admin_fields) {
                      if (_.isArray(admin_fields)) {
                        return _.every(
                          admin_fields,
                          function (field) {
                            if ('text' === field.type &&
                                _.isString(field.value)) {
                              return (field.value.length <= ElectionLimits.maxLongStringLength);
                            }
                            return true;
                          });
                      }
                      return true;
                    },
                    postfix: "-admin-fields-string-value-array-length"
                  },
                  {
                    check: "lambda",
                    key: "admin_fields",
                    append: {key: "max", value: ElectionLimits.maxLongStringLength},
                    appendOnErrorLambda: function (admin_fields) {
                      var adminNames = [];
                      if (_.isArray(admin_fields)) {
                        _.each(
                          admin_fields,
                          function (field) {
                              if ('email' === field.type &&
                                   _.isString(field.value) &&
                                   (field.value.length > ElectionLimits.maxLongStringLength)) {
                              var field_name = field.name;
                              if (_.isString(field.label) &&
                                  0 < field.label.length) {
                                field_name = field.label;
                              }
                              adminNames.push(field_name);
                            }
                          });
                      }
                      return {"admin_names": adminNames.join(", ")};
                    },
                    validator: function (admin_fields) {
                      if (_.isArray(admin_fields)) {
                        return _.every(
                          admin_fields,
                          function (field) {
                            if ('email' === field.type &&
                                _.isString(field.value)) {
                              return (field.value.length <= ElectionLimits.maxLongStringLength);
                            }
                            return true;
                          });
                      }
                      return true;
                    },
                    postfix: "-admin-fields-email-value-array-length"
                  },
                  {
                    check: "lambda",
                    key: "admin_fields",
                    appendOnErrorLambda: function (admin_fields) {
                      var adminNames = [];
                      if (_.isArray(admin_fields)) {
                        _.each(
                          admin_fields,
                          function (field) {
                              if ('int' === field.type &&
                                   !_.isUndefined(field.value) &&
                                   _.isNumber(field.value) &&
                                   !_.isUndefined(field.min) &&
                                   _.isNumber(field.min) &&
                                   field.min > field.value) {
                              var field_name = field.name;
                              if (_.isString(field.label) &&
                                  0 < field.label.length) {
                                field_name = field.label;
                              }
                              adminNames.push(field_name);
                            }
                          });
                      }
                      return {"admin_names": adminNames.join(", ")};
                    },
                    validator: function (admin_fields) {
                      if (_.isArray(admin_fields)) {
                        return _.every(
                          admin_fields,
                          function (field) {
                            if ('int' === field.type &&
                                !_.isUndefined(field.value) &&
                                _.isNumber(field.value) &&
                                !_.isUndefined(field.min) &&
                                _.isNumber(field.min)) {
                              return (field.min <= field.value);
                            }
                            return true;
                          });
                      }
                      return true;
                    },
                    postfix: "-admin-fields-int-min-value"
                  },
                  {
                    check: "lambda",
                    key: "admin_fields",
                    appendOnErrorLambda: function (admin_fields) {
                      var adminNames = [];
                      if (_.isArray(admin_fields)) {
                        _.each(
                          admin_fields,
                          function (field) {
                              if ('int' === field.type &&
                                   !_.isUndefined(field.value) &&
                                   _.isNumber(field.value) &&
                                   !_.isUndefined(field.max) &&
                                   _.isNumber(field.max) &&
                                   field.max < field.value) {
                              var field_name = field.name;
                              if (_.isString(field.label) &&
                                  0 < field.label.length) {
                                field_name = field.label;
                              }
                              adminNames.push(field_name);
                            }
                          });
                      }
                      return {"admin_names": adminNames.join(", ")};
                    },
                    validator: function (admin_fields) {
                      if (_.isArray(admin_fields)) {
                        return _.every(
                          admin_fields,
                          function (field) {
                            if ('int' === field.type &&
                                !_.isUndefined(field.value) &&
                                _.isNumber(field.value) &&
                                !_.isUndefined(field.max) &&
                                _.isNumber(field.max)) {
                              return (field.max >= field.value);
                            }
                            return true;
                          });
                      }
                      return true;
                    },
                    postfix: "-admin-fields-int-max-value"
                  },
                  {
                    check: "array-key-group-chain",
                    key: "admin_fields",
                    prefix: "admin-fields-",
                    append: {key: "fname", value: "$value.name"},
                    checks: [
                      {
                        check: "is-string-if-defined",
                        key: "placeholder",
                        postfix: "-placeholder"
                      },
                      {
                        check: "array-length-if-defined",
                        key: "placeholder",
                        min: 0,
                        max: ElectionLimits.maxLongStringLength,
                        postfix: "-placeholder"
                      },
                      {
                        check: "is-string",
                        key: "label",
                        postfix: "-label"
                      },
                      {
                        check: "array-length",
                        key: "label",
                        min: 0,
                        max: ElectionLimits.maxLongStringLength,
                        postfix: "-label"
                      },
                      {
                        check: "is-string-if-defined",
                        key: "description",
                        postfix: "-description"
                      },
                      {
                        check: "array-length-if-defined",
                        key: "description",
                        min: 0,
                        max: ElectionLimits.maxLongStringLength,
                        postfix: "-description"
                      },
                      {
                        check: "is-string",
                        key: "name",
                        postfix: "-name"
                      },
                      {
                        check: "array-length",
                        key: "name",
                        min: 0,
                        max: ElectionLimits.maxLongStringLength,
                        postfix: "-name"
                      },
                      {
                        check: "is-string",
                        key: "type",
                        postfix: "-type"
                      },
                      {
                        check: "array-length",
                        key: "type",
                        min: 0,
                        max: ElectionLimits.maxLongStringLength,
                        postfix: "-type"
                      },
                      {
                        check: "lambda",
                        key: "min",
                        validator: function (min) {
                          if (!_.isUndefined(min) && !_.isNumber(min)) {
                            return false;
                          }
                          return true;
                        },
                        postfix: "-min-number"
                      },
                      {
                        check: "lambda",
                        key: "max",
                        validator: function (max) {
                          if (!_.isUndefined(max) && !_.isNumber(max)) {
                            return false;
                          }
                          return true;
                        },
                        postfix: "-max-number"
                      },
                      {
                        check: "lambda",
                        key: "step",
                        validator: function (step) {
                          if (!_.isUndefined(step) && !_.isNumber(step)) {
                            return false;
                          }
                          return true;
                        },
                        postfix: "-step-number"
                      },
                      {
                        check: "lambda",
                        key: "required",
                        validator: function (required) {
                          if (!_.isUndefined(required) && !_.isBoolean(required)) {
                            return false;
                          }
                          return true;
                        },
                        postfix: "-required-boolean"
                      },
                      {
                        check: "lambda",
                        key: "private",
                        validator: function (_private) {
                          if (!_.isUndefined(_private) && !_.isBoolean(_private)) {
                            return false;
                          }
                          return true;
                        },
                        postfix: "-private-boolean"
                      }
                    ]
                  },
                ]},
            ]
          }
        ];

        Plugins.hook('election-create-add-checks', {'checks': checks, 'elections': scope.elections});
        scope.errors = [];
        CheckerService({
          checks: checks,
          data: scope.elections,
          onError: function (errorKey, errorData) {
            scope.errors.push({
              data: errorData,
              key: errorKey
            });
          }
        });

        function createAuthEvent(el) {
            console.log("creating auth event for election " + el.title);
            var deferred = $q.defer();
            // Creating the authentication
            logInfo($i18next('avAdmin.create.creating', {title: el.title}));

            // sanitize some unneeded values that might still be there. This
            // needs to be done because how we use ng-model
            if (el.census.config.subject && el.census.auth_method !== 'email') {
              delete el.census.config.subject;
            }
            var authAction = el.census.config['authentication-action'];
            if (authAction.mode === 'vote') {
              authAction["mode-config"] = null;
            }

            var d = {
                auth_method: el.census.auth_method,
                has_ballot_boxes: el.census.has_ballot_boxes,
                census: el.census.census,
                auth_method_config: el.census.config,
                extra_fields: [],
                admin_fields: [],
                num_successful_logins_allowed: el.num_successful_logins_allowed,
                allow_public_census_query: el.allow_public_census_query
            };

            d.admin_fields = _.filter(el.census.admin_fields, function(af) {
              return true;
            });

            d.extra_fields = _.filter(el.census.extra_fields, function(ef) {
              var must = ef.must;
              delete ef.disabled;
              delete ef.must;

              // only add regex if it's filled and it's a text field
              if (!angular.isUndefined(ef.regex) &&
                (!_.contains(['int', 'text'], ef.type) || $.trim(ef.regex).length === 0)) {
                delete ef.regex;
              }

              if (_.contains(['bool', 'captcha'], ef.type)) {
                delete ef.min;
                delete ef.max;
              } else {
                if (!!ef.min) {
                  ef.min = parseInt(ef.min);
                }
                if (!!ef.max) {
                  ef.max = parseInt(ef.max);
                }
              }
              return !must;
            });

            Authmethod.createEvent(d)
                .success(function(data) {
                    el.id = data.id;
                    deferred.resolve(el);
                }).error(deferred.reject);
            return deferred.promise;
        }

        function addCensus(el) {
            console.log("adding census for election " + el.title);
            var deferred = $q.defer();

            // Adding the census
            logInfo($i18next('avAdmin.create.census', {title: el.title, id: el.id}));

            var data = {
              election: el,
              error: function (errorMsg) {
                  scope.errors.push({
                    data: {message: errorMsg},
                    key: "election-census-createel-unknown"
                  });
                },
              disableOk: false,
              cancel: function (error) {
                Plugins.hook('census-csv-load-error', error);
              },
              close: function () {}
            };
            CsvLoad.uploadUponElCreation(data)
                .then(function(data) {
                    deferred.resolve(el);
                }).catch(deferred.reject);

            return deferred.promise;
        }

        function registerElection(el) {
            console.log("registering election " + el.title);

              if (typeof el.extra_data === 'object') {
                  el.extra_data = JSON.stringify(el.extra_data);
              }
            _.each(el.questions, function (q) {
              _.each(q.answers, function (answer) {
                answer.urls = _.filter(answer.urls, function(url) { return $.trim(url.url).length > 0;});
              });
            });
            var deferred = $q.defer();
            // Registering the election
            logInfo($i18next('avAdmin.create.reg', {title: el.title, id: el.id}));
            ElectionsApi.command(el, '', 'POST', el)
                .then(function(data) { deferred.resolve(el); })
                .catch(deferred.reject);
            return deferred.promise;
        }

        function createElection(el) {
            var deferred = $q.defer();
            if (scope.createElectionBool) {
              console.log("creating election " + el.title);
              Plugins.hook('election-create', {'el': el});
              if (typeof el.extra_data === 'object') {
                  el.extra_data = JSON.stringify(el.extra_data);
              }
              // Creating the election
              logInfo($i18next('avAdmin.create.creatingEl', {title: el.title, id: el.id}));
              ElectionsApi.command(el, 'create', 'POST', {})
                .then(function(data) { deferred.resolve(el); })
                .catch(deferred.reject);
            } else {
              deferred.resolve(el);
            }
            return deferred.promise;
        }

        function addElection(i) {
          var deferred = $q.defer();
          if (i === scope.elections.length) {
            var el = scope.elections[i - 1];
            $state.go("admin.dashboard", {id: el.id});
            return;
          }

          var promise = deferred.promise;
          promise = promise
            .then(createAuthEvent)
            .then(addCensus)
            .then(registerElection)
            .then(createElection)
            .then(function(el) {
                console.log("waiting for election " + el.title);
                waitForCreated(el.id, function () {
                  DraftElection.eraseDraft();
                  addElection(i+1);
                });
              })
              .catch(function(error) {
                scope.creating = false;
                scope.creating_text = '';
                logError(angular.toJson(error));
              });
          deferred.resolve(scope.elections[i]);
        }

        scope.editJson = function()
        {
          if(!ConfigService.allowEditElectionJson) {
            return;
          }
          // show the initial edit dialog
          $modal
            .open({
              templateUrl: "avAdmin/admin-directives/create/edit-election-json-modal.html",
              controller: "EditElectionJsonModal",
              size: 'lg',
              resolve: {
                electionJson: function () { return angular.toJson(scope.elections, true); }
              }
            })
            .result.then(
              function (data)
              {
                scope.elections = angular.fromJson(data.electionJson);

                scope.errors = [];
                CheckerService({
                  checks: checks,
                  data: scope.elections,
                  onError: function (errorKey, errorData) {
                    scope.errors.push({
                      data: errorData,
                      key: errorKey
                    });
                  }
                });
              }
            );
        };

        function createElections() {
            var deferred = $q.defer();
            addElection(0);
            var promise = deferred.promise;

            scope.creating = true;
        }

        if ($stateParams.autocreate === "true") {
            createElections();
        }

        function waitForCreated(id, f) {
          console.log("waiting for election id = " + id);
          ElectionsApi.getElection(id, true)
            .then(function(el) {
                var deferred = $q.defer();
                if (scope.createElectionBool && el.status === 'created' ||
                  !scope.createElectionBool && el.status === 'registered')
                {
                  f();
                } else {
                  setTimeout(function() { waitForCreated(id, f); }, 3000);
                }
            });
        }

        angular.extend(scope, {
          createElections: createElections,
        });
      }

      return {
        restrict: 'AE',
        scope: {
        },
        link: link,
        templateUrl: 'avAdmin/admin-directives/create/create.html'
      };
    });
