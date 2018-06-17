function filterQueryString(obj) {
  return Object.keys(obj)
    .map(k => `filter[${k}]=${encodeURIComponent(obj[k])}`)
    .join('&');
}

const storeRecord = (records) => (newRecord) => {
  const existingRecord = records.find(r => r.id === newRecord.id);
  if (existingRecord) {
    Object.assign(existingRecord, newRecord);
  } else {
    records.push(newRecord);
  }
};

const getOptionsQuery = (optionsObject = {}) => (
  optionsObject.include ? `include=${optionsObject.include}` : ''
);

const matches = (criteria) => (test) => (
  Object.keys(criteria).every(key => (
    criteria[key] === test[key]
  ))
);

const resourceStore = ({ name: resourceName, httpClient: api }) => {
  const collectionUrl = resourceName;
  const resourceUrl = id => `${resourceName}/${id}`;
  const relatedResourceUrl = parent => `${parent.type}/${parent.id}`;

  return {
    namespaced: true,

    state: {
      records: [],
      related: [],
    },

    mutations: {
      REPLACE_ALL_RECORDS: (state, records) => {
        state.records = records;
      },

      REPLACE_ALL_RELATED: (state, related) => {
        state.related = related;
      },

      STORE_RECORD: (state, newRecord) => {
        const { records } = state;

        storeRecord(records)(newRecord);
      },

      STORE_RECORDS: (state, newRecords) => {
        const { records } = state;

        newRecords.forEach(storeRecord(records));
      },

      STORE_RELATED: (state, parent) => {
        const { related } = state;

        storeRecord(related)(parent);
      },

      REMOVE_RECORD: (state, record) => {
        state.records = state.records.filter(r => r.id !== record.id);
      },
    },

    actions: {
      loadAll({ commit }, { options } = {}) {
        const url = `${collectionUrl}?${getOptionsQuery(options)}`;
        return api.get(url)
          .then(results => {
            commit('REPLACE_ALL_RECORDS', results.data.data);
          });
      },

      loadById({ commit }, { id, options }) {
        const url = `${resourceUrl(id)}?${getOptionsQuery(options)}`;
        return api.get(url)
          .then(results => {
            commit('STORE_RECORD', results.data.data);
          });
      },

      loadBy({ commit }, { filter, options }) {
        const searchQuery = filterQueryString(filter);
        const optionsQuery = getOptionsQuery(options);
        const fullUrl = `${collectionUrl}?${searchQuery}&${optionsQuery}`;
        return api.get(fullUrl)
          .then(results => {
            commit('REPLACE_ALL_RECORDS', results.data.data);
          });
      },

      loadRelated({ commit }, { parent, options }) {
        const url = relatedResourceUrl(parent);
        const optionsWithInclude = Object.assign(
          // TODO: allow relation to be named something
          // other than the resource name
          { include: resourceName },
          options,
        );
        return api.get(`${url}?${getOptionsQuery(optionsWithInclude)}`)
          .then(results => {
            commit('STORE_RECORDS', results.data.included);
            commit('STORE_RELATED', results.data.data);
          });
      },

      create({ commit }, recordData) {
        const requestBody = {
          data: Object.assign(
            { type: resourceName },
            recordData,
          ),
        };
        return api.post(collectionUrl, requestBody)
          .then(result => {
            commit('STORE_RECORD', result.data.data);
          });
      },

      update({ commit }, record) {
        return api.patch(resourceUrl(record.id), record)
          .then(() => {
            commit('STORE_RECORD', record);
          });
      },

      delete({ commit }, record) {
        return api.delete(resourceUrl(record.id))
          .then(() => {
            commit('REMOVE_RECORD', record);
          });
      },
    },

    getters: {
      all: state => state.records,
      find: state => id => state.records.find(r => r.id === id),
      where: state => criteria => (
        state.records.filter(record => matches(criteria)(record.attributes))
      ),
      related: state => ({ type, id }) => {
        const related = state.related.find(matches({ type, id }));

        if (!related) {
          return [];
        }

        const ids = related.relationships[resourceName].data.map(r => r.id);
        return state.records.filter(record => ids.includes(record.id));
      },
    },
  };
};

const mapResourceStores = ({ names, httpClient }) => (
  names.reduce(
    (acc, name) => (
      Object.assign({ [name]: resourceStore({ name, httpClient }) }, acc)
    ),
    {},
  )
);

export {
  resourceStore,
  mapResourceStores,
};