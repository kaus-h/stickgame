// Generated from content/level.schema.json by npm run levels:compile-schema. Do not edit.
'use strict';
export const validate = validate21;
export default validate21;
const schema6 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://stickgame.dev/schemas/level.json',
  title: 'StickGame level authoring v1/v2',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'id', 'name', 'spawn', 'bounds', 'killY', 'solids'],
  properties: {
    $schema: { type: 'string' },
    version: { enum: [1, 2] },
    id: { $ref: '#/definitions/id' },
    name: { $ref: '#/definitions/text' },
    spawn: { $ref: '#/definitions/point' },
    bounds: {
      type: 'object',
      additionalProperties: false,
      required: ['minX', 'minY', 'maxX', 'maxY'],
      properties: {
        minX: { type: 'number' },
        minY: { type: 'number' },
        maxX: { type: 'number' },
        maxY: { type: 'number' },
      },
    },
    killY: { type: 'number' },
    solids: { type: 'array', items: { $ref: '#/definitions/solid' } },
    anchors: { type: 'array', items: { $ref: '#/definitions/anchor' } },
    enemies: { type: 'array', items: { $ref: '#/definitions/patroller' } },
    exit: { oneOf: [{ $ref: '#/definitions/region' }, { $ref: '#/definitions/exit' }] },
    section: { $ref: '#/definitions/id' },
    telemetry: {
      type: 'object',
      additionalProperties: false,
      required: ['levelId'],
      properties: { levelId: { $ref: '#/definitions/id' } },
    },
    chambers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'region', 'problem', 'challengeFamily'],
        properties: {
          id: { $ref: '#/definitions/id' },
          region: { $ref: '#/definitions/region' },
          problem: { $ref: '#/definitions/text' },
          challengeFamily: { $ref: '#/definitions/text' },
        },
      },
    },
    checkpoints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'position'],
        properties: { id: { $ref: '#/definitions/id' }, position: { $ref: '#/definitions/point' } },
      },
    },
    tunnels: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'region'],
        properties: { id: { $ref: '#/definitions/id' }, region: { $ref: '#/definitions/region' } },
      },
    },
    cameraHints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'region', 'focus'],
        properties: {
          id: { $ref: '#/definitions/id' },
          region: { $ref: '#/definitions/region' },
          focus: { $ref: '#/definitions/point' },
        },
      },
    },
  },
  allOf: [
    {
      if: { properties: { version: { const: 1 } } },
      then: { properties: { exit: { $ref: '#/definitions/region' }, enemies: false } },
    },
  ],
  definitions: {
    patroller: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'kind', 'position', 'size', 'stomp'],
      properties: {
        id: { $ref: '#/definitions/id' },
        kind: { const: 'patroller' },
        position: { $ref: '#/definitions/point' },
        size: { $ref: '#/definitions/point' },
        path: { $ref: '#/definitions/path' },
        stomp: {
          type: 'object',
          additionalProperties: false,
          required: ['minDownSpeed', 'reboundSpeed', 'topInset'],
          properties: {
            minDownSpeed: { type: 'number', exclusiveMinimum: 0 },
            reboundSpeed: { type: 'number', exclusiveMinimum: 0 },
            topInset: { type: 'number', minimum: 0 },
          },
        },
      },
    },
    path: {
      type: 'object',
      additionalProperties: false,
      required: ['to', 'period'],
      properties: {
        to: { $ref: '#/definitions/point' },
        period: { type: 'number', exclusiveMinimum: 0 },
        phase: { type: 'number', minimum: 0, exclusiveMaximum: 1 },
      },
    },
    exit: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'family', 'min', 'max', 'entry'],
      allOf: [
        {
          if: { properties: { family: { const: 'slot' } } },
          then: { properties: { entry: { properties: { side: { enum: ['left', 'right'] } } } } },
        },
        {
          if: { properties: { family: { const: 'shaft' } } },
          then: { properties: { entry: { properties: { side: { enum: ['top', 'bottom'] } } } } },
        },
      ],
      properties: {
        id: { $ref: '#/definitions/id' },
        family: { enum: ['wide', 'slot', 'shaft'] },
        min: { $ref: '#/definitions/point' },
        max: { $ref: '#/definitions/point' },
        entry: {
          type: 'object',
          additionalProperties: false,
          required: ['side', 'angle', 'alignment'],
          properties: {
            side: { enum: ['left', 'right', 'top', 'bottom'] },
            angle: { $ref: '#/definitions/angleWindow' },
            speed: { $ref: '#/definitions/speedWindow' },
            alignment: { $ref: '#/definitions/alignmentWindow' },
          },
        },
      },
    },
    angleWindow: {
      type: 'object',
      additionalProperties: false,
      required: ['min', 'max'],
      properties: {
        min: { type: 'number', minimum: 0, exclusiveMaximum: 90 },
        max: { type: 'number', minimum: 0, maximum: 90 },
      },
    },
    speedWindow: {
      type: 'object',
      additionalProperties: false,
      required: ['min', 'max'],
      properties: {
        min: { type: 'number', minimum: 0 },
        max: { type: 'number', exclusiveMinimum: 0 },
      },
    },
    alignmentWindow: {
      type: 'object',
      additionalProperties: false,
      required: ['min', 'max'],
      properties: {
        min: { type: 'number', minimum: 0, maximum: 1 },
        max: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    text: { type: 'string', minLength: 1 },
    id: { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$' },
    point: {
      oneOf: [
        { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } },
        {
          type: 'object',
          additionalProperties: false,
          required: ['x', 'y'],
          properties: { x: { type: 'number' }, y: { type: 'number' } },
        },
      ],
    },
    region: {
      type: 'object',
      additionalProperties: false,
      required: ['min', 'max'],
      properties: { min: { $ref: '#/definitions/point' }, max: { $ref: '#/definitions/point' } },
    },
    solid: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      oneOf: [{ required: ['rect'] }, { required: ['points'] }],
      properties: {
        id: { $ref: '#/definitions/id' },
        kind: { enum: ['solid', 'hazard'] },
        rect: {
          type: 'object',
          additionalProperties: false,
          required: ['x', 'y', 'w', 'h'],
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            w: { type: 'number', exclusiveMinimum: 0 },
            h: { type: 'number', exclusiveMinimum: 0 },
          },
        },
        points: { type: 'array', minItems: 3, items: { $ref: '#/definitions/point' } },
        visualPoints: { type: 'array', minItems: 3, items: { $ref: '#/definitions/point' } },
      },
    },
    anchor: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'position'],
      properties: {
        id: { $ref: '#/definitions/id' },
        position: { $ref: '#/definitions/point' },
        requiredFrom: { $ref: '#/definitions/point' },
        radius: { type: 'number', exclusiveMinimum: 0 },
        path: { $ref: '#/definitions/path' },
      },
    },
  },
};
const schema7 = {
  type: 'object',
  additionalProperties: false,
  required: ['min', 'max'],
  properties: { min: { $ref: '#/definitions/point' }, max: { $ref: '#/definitions/point' } },
};
const schema8 = {
  oneOf: [
    { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } },
    {
      type: 'object',
      additionalProperties: false,
      required: ['x', 'y'],
      properties: { x: { type: 'number' }, y: { type: 'number' } },
    },
  ],
};
function validate23(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (Array.isArray(data)) {
    if (data.length > 2) {
      const err0 = {
        instancePath,
        schemaPath: '#/oneOf/0/maxItems',
        keyword: 'maxItems',
        params: { limit: 2 },
        message: 'must NOT have more than 2 items',
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.length < 2) {
      const err1 = {
        instancePath,
        schemaPath: '#/oneOf/0/minItems',
        keyword: 'minItems',
        params: { limit: 2 },
        message: 'must NOT have fewer than 2 items',
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    const len0 = data.length;
    for (let i0 = 0; i0 < len0; i0++) {
      let data0 = data[i0];
      if (!(typeof data0 == 'number' && isFinite(data0))) {
        const err2 = {
          instancePath: instancePath + '/' + i0,
          schemaPath: '#/oneOf/0/items/type',
          keyword: 'type',
          params: { type: 'number' },
          message: 'must be number',
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
  } else {
    const err3 = {
      instancePath,
      schemaPath: '#/oneOf/0/type',
      keyword: 'type',
      params: { type: 'array' },
      message: 'must be array',
    };
    if (vErrors === null) {
      vErrors = [err3];
    } else {
      vErrors.push(err3);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs5 = errors;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.x === undefined) {
      const err4 = {
        instancePath,
        schemaPath: '#/oneOf/1/required',
        keyword: 'required',
        params: { missingProperty: 'x' },
        message: "must have required property '" + 'x' + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.y === undefined) {
      const err5 = {
        instancePath,
        schemaPath: '#/oneOf/1/required',
        keyword: 'required',
        params: { missingProperty: 'y' },
        message: "must have required property '" + 'y' + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === 'x' || key0 === 'y')) {
        const err6 = {
          instancePath,
          schemaPath: '#/oneOf/1/additionalProperties',
          keyword: 'additionalProperties',
          params: { additionalProperty: key0 },
          message: 'must NOT have additional properties',
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.x !== undefined) {
      let data1 = data.x;
      if (!(typeof data1 == 'number' && isFinite(data1))) {
        const err7 = {
          instancePath: instancePath + '/x',
          schemaPath: '#/oneOf/1/properties/x/type',
          keyword: 'type',
          params: { type: 'number' },
          message: 'must be number',
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.y !== undefined) {
      let data2 = data.y;
      if (!(typeof data2 == 'number' && isFinite(data2))) {
        const err8 = {
          instancePath: instancePath + '/y',
          schemaPath: '#/oneOf/1/properties/y/type',
          keyword: 'type',
          params: { type: 'number' },
          message: 'must be number',
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
  } else {
    const err9 = {
      instancePath,
      schemaPath: '#/oneOf/1/type',
      keyword: 'type',
      params: { type: 'object' },
      message: 'must be object',
    };
    if (vErrors === null) {
      vErrors = [err9];
    } else {
      vErrors.push(err9);
    }
    errors++;
  }
  var _valid0 = _errs5 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
  }
  if (!valid0) {
    const err10 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err10];
    } else {
      vErrors.push(err10);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate23.errors = vErrors;
  return errors === 0;
}
function validate22(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.min === undefined) {
      const err0 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'min' },
        message: "must have required property '" + 'min' + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.max === undefined) {
      const err1 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'max' },
        message: "must have required property '" + 'max' + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === 'min' || key0 === 'max')) {
        const err2 = {
          instancePath,
          schemaPath: '#/additionalProperties',
          keyword: 'additionalProperties',
          params: { additionalProperty: key0 },
          message: 'must NOT have additional properties',
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.min !== undefined) {
      if (
        !validate23(data.min, {
          instancePath: instancePath + '/min',
          parentData: data,
          parentDataProperty: 'min',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
        errors = vErrors.length;
      }
    }
    if (data.max !== undefined) {
      if (
        !validate23(data.max, {
          instancePath: instancePath + '/max',
          parentData: data,
          parentDataProperty: 'max',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err3 = {
      instancePath,
      schemaPath: '#/type',
      keyword: 'type',
      params: { type: 'object' },
      message: 'must be object',
    };
    if (vErrors === null) {
      vErrors = [err3];
    } else {
      vErrors.push(err3);
    }
    errors++;
  }
  validate22.errors = vErrors;
  return errors === 0;
}
const schema9 = { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$' };
const pattern0 = new RegExp('^[a-zA-Z0-9][a-zA-Z0-9._-]*$', 'u');
function validate27(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data === 'string') {
    if (!pattern0.test(data)) {
      const err0 = {
        instancePath,
        schemaPath: '#/pattern',
        keyword: 'pattern',
        params: { pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$' },
        message: 'must match pattern "' + '^[a-zA-Z0-9][a-zA-Z0-9._-]*$' + '"',
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
  } else {
    const err1 = {
      instancePath,
      schemaPath: '#/type',
      keyword: 'type',
      params: { type: 'string' },
      message: 'must be string',
    };
    if (vErrors === null) {
      vErrors = [err1];
    } else {
      vErrors.push(err1);
    }
    errors++;
  }
  validate27.errors = vErrors;
  return errors === 0;
}
const schema10 = { type: 'string', minLength: 1 };
function validate29(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data === 'string') {
    if (data.length < 1) {
      const err0 = {
        instancePath,
        schemaPath: '#/minLength',
        keyword: 'minLength',
        params: { limit: 1 },
        message: 'must NOT have fewer than 1 characters',
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
  } else {
    const err1 = {
      instancePath,
      schemaPath: '#/type',
      keyword: 'type',
      params: { type: 'string' },
      message: 'must be string',
    };
    if (vErrors === null) {
      vErrors = [err1];
    } else {
      vErrors.push(err1);
    }
    errors++;
  }
  validate29.errors = vErrors;
  return errors === 0;
}
const schema11 = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  oneOf: [{ required: ['rect'] }, { required: ['points'] }],
  properties: {
    id: { $ref: '#/definitions/id' },
    kind: { enum: ['solid', 'hazard'] },
    rect: {
      type: 'object',
      additionalProperties: false,
      required: ['x', 'y', 'w', 'h'],
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        w: { type: 'number', exclusiveMinimum: 0 },
        h: { type: 'number', exclusiveMinimum: 0 },
      },
    },
    points: { type: 'array', minItems: 3, items: { $ref: '#/definitions/point' } },
    visualPoints: { type: 'array', minItems: 3, items: { $ref: '#/definitions/point' } },
  },
};
function validate32(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs1 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs2 = errors;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.rect === undefined) {
      const err0 = {
        instancePath,
        schemaPath: '#/oneOf/0/required',
        keyword: 'required',
        params: { missingProperty: 'rect' },
        message: "must have required property '" + 'rect' + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
  }
  var _valid0 = _errs2 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs3 = errors;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.points === undefined) {
      const err1 = {
        instancePath,
        schemaPath: '#/oneOf/1/required',
        keyword: 'required',
        params: { missingProperty: 'points' },
        message: "must have required property '" + 'points' + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
  }
  var _valid0 = _errs3 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
  }
  if (!valid0) {
    const err2 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err2];
    } else {
      vErrors.push(err2);
    }
    errors++;
  } else {
    errors = _errs1;
    if (vErrors !== null) {
      if (_errs1) {
        vErrors.length = _errs1;
      } else {
        vErrors = null;
      }
    }
  }
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err3 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'id' },
        message: "must have required property '" + 'id' + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(
        key0 === 'id' ||
        key0 === 'kind' ||
        key0 === 'rect' ||
        key0 === 'points' ||
        key0 === 'visualPoints'
      )) {
        const err4 = {
          instancePath,
          schemaPath: '#/additionalProperties',
          keyword: 'additionalProperties',
          params: { additionalProperty: key0 },
          message: 'must NOT have additional properties',
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      if (
        !validate27(data.id, {
          instancePath: instancePath + '/id',
          parentData: data,
          parentDataProperty: 'id',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
        errors = vErrors.length;
      }
    }
    if (data.kind !== undefined) {
      let data1 = data.kind;
      if (!(data1 === 'solid' || data1 === 'hazard')) {
        const err5 = {
          instancePath: instancePath + '/kind',
          schemaPath: '#/properties/kind/enum',
          keyword: 'enum',
          params: { allowedValues: schema11.properties.kind.enum },
          message: 'must be equal to one of the allowed values',
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.rect !== undefined) {
      let data2 = data.rect;
      if (data2 && typeof data2 == 'object' && !Array.isArray(data2)) {
        if (data2.x === undefined) {
          const err6 = {
            instancePath: instancePath + '/rect',
            schemaPath: '#/properties/rect/required',
            keyword: 'required',
            params: { missingProperty: 'x' },
            message: "must have required property '" + 'x' + "'",
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data2.y === undefined) {
          const err7 = {
            instancePath: instancePath + '/rect',
            schemaPath: '#/properties/rect/required',
            keyword: 'required',
            params: { missingProperty: 'y' },
            message: "must have required property '" + 'y' + "'",
          };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data2.w === undefined) {
          const err8 = {
            instancePath: instancePath + '/rect',
            schemaPath: '#/properties/rect/required',
            keyword: 'required',
            params: { missingProperty: 'w' },
            message: "must have required property '" + 'w' + "'",
          };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data2.h === undefined) {
          const err9 = {
            instancePath: instancePath + '/rect',
            schemaPath: '#/properties/rect/required',
            keyword: 'required',
            params: { missingProperty: 'h' },
            message: "must have required property '" + 'h' + "'",
          };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        for (const key1 in data2) {
          if (!(key1 === 'x' || key1 === 'y' || key1 === 'w' || key1 === 'h')) {
            const err10 = {
              instancePath: instancePath + '/rect',
              schemaPath: '#/properties/rect/additionalProperties',
              keyword: 'additionalProperties',
              params: { additionalProperty: key1 },
              message: 'must NOT have additional properties',
            };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data2.x !== undefined) {
          let data3 = data2.x;
          if (!(typeof data3 == 'number' && isFinite(data3))) {
            const err11 = {
              instancePath: instancePath + '/rect/x',
              schemaPath: '#/properties/rect/properties/x/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data2.y !== undefined) {
          let data4 = data2.y;
          if (!(typeof data4 == 'number' && isFinite(data4))) {
            const err12 = {
              instancePath: instancePath + '/rect/y',
              schemaPath: '#/properties/rect/properties/y/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data2.w !== undefined) {
          let data5 = data2.w;
          if (typeof data5 == 'number' && isFinite(data5)) {
            if (data5 <= 0 || isNaN(data5)) {
              const err13 = {
                instancePath: instancePath + '/rect/w',
                schemaPath: '#/properties/rect/properties/w/exclusiveMinimum',
                keyword: 'exclusiveMinimum',
                params: { comparison: '>', limit: 0 },
                message: 'must be > 0',
              };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          } else {
            const err14 = {
              instancePath: instancePath + '/rect/w',
              schemaPath: '#/properties/rect/properties/w/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data2.h !== undefined) {
          let data6 = data2.h;
          if (typeof data6 == 'number' && isFinite(data6)) {
            if (data6 <= 0 || isNaN(data6)) {
              const err15 = {
                instancePath: instancePath + '/rect/h',
                schemaPath: '#/properties/rect/properties/h/exclusiveMinimum',
                keyword: 'exclusiveMinimum',
                params: { comparison: '>', limit: 0 },
                message: 'must be > 0',
              };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          } else {
            const err16 = {
              instancePath: instancePath + '/rect/h',
              schemaPath: '#/properties/rect/properties/h/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
      } else {
        const err17 = {
          instancePath: instancePath + '/rect',
          schemaPath: '#/properties/rect/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.points !== undefined) {
      let data7 = data.points;
      if (Array.isArray(data7)) {
        if (data7.length < 3) {
          const err18 = {
            instancePath: instancePath + '/points',
            schemaPath: '#/properties/points/minItems',
            keyword: 'minItems',
            params: { limit: 3 },
            message: 'must NOT have fewer than 3 items',
          };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        const len0 = data7.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate23(data7[i0], {
              instancePath: instancePath + '/points/' + i0,
              parentData: data7,
              parentDataProperty: i0,
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err19 = {
          instancePath: instancePath + '/points',
          schemaPath: '#/properties/points/type',
          keyword: 'type',
          params: { type: 'array' },
          message: 'must be array',
        };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.visualPoints !== undefined) {
      let data9 = data.visualPoints;
      if (Array.isArray(data9)) {
        if (data9.length < 3) {
          const err20 = {
            instancePath: instancePath + '/visualPoints',
            schemaPath: '#/properties/visualPoints/minItems',
            keyword: 'minItems',
            params: { limit: 3 },
            message: 'must NOT have fewer than 3 items',
          };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
        const len1 = data9.length;
        for (let i1 = 0; i1 < len1; i1++) {
          if (
            !validate23(data9[i1], {
              instancePath: instancePath + '/visualPoints/' + i1,
              parentData: data9,
              parentDataProperty: i1,
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err21 = {
          instancePath: instancePath + '/visualPoints',
          schemaPath: '#/properties/visualPoints/type',
          keyword: 'type',
          params: { type: 'array' },
          message: 'must be array',
        };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
  } else {
    const err22 = {
      instancePath,
      schemaPath: '#/type',
      keyword: 'type',
      params: { type: 'object' },
      message: 'must be object',
    };
    if (vErrors === null) {
      vErrors = [err22];
    } else {
      vErrors.push(err22);
    }
    errors++;
  }
  validate32.errors = vErrors;
  return errors === 0;
}
const schema12 = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'position'],
  properties: {
    id: { $ref: '#/definitions/id' },
    position: { $ref: '#/definitions/point' },
    requiredFrom: { $ref: '#/definitions/point' },
    radius: { type: 'number', exclusiveMinimum: 0 },
    path: { $ref: '#/definitions/path' },
  },
};
const schema13 = {
  type: 'object',
  additionalProperties: false,
  required: ['to', 'period'],
  properties: {
    to: { $ref: '#/definitions/point' },
    period: { type: 'number', exclusiveMinimum: 0 },
    phase: { type: 'number', minimum: 0, exclusiveMaximum: 1 },
  },
};
function validate41(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.to === undefined) {
      const err0 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'to' },
        message: "must have required property '" + 'to' + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.period === undefined) {
      const err1 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'period' },
        message: "must have required property '" + 'period' + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === 'to' || key0 === 'period' || key0 === 'phase')) {
        const err2 = {
          instancePath,
          schemaPath: '#/additionalProperties',
          keyword: 'additionalProperties',
          params: { additionalProperty: key0 },
          message: 'must NOT have additional properties',
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.to !== undefined) {
      if (
        !validate23(data.to, {
          instancePath: instancePath + '/to',
          parentData: data,
          parentDataProperty: 'to',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
        errors = vErrors.length;
      }
    }
    if (data.period !== undefined) {
      let data1 = data.period;
      if (typeof data1 == 'number' && isFinite(data1)) {
        if (data1 <= 0 || isNaN(data1)) {
          const err3 = {
            instancePath: instancePath + '/period',
            schemaPath: '#/properties/period/exclusiveMinimum',
            keyword: 'exclusiveMinimum',
            params: { comparison: '>', limit: 0 },
            message: 'must be > 0',
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      } else {
        const err4 = {
          instancePath: instancePath + '/period',
          schemaPath: '#/properties/period/type',
          keyword: 'type',
          params: { type: 'number' },
          message: 'must be number',
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.phase !== undefined) {
      let data2 = data.phase;
      if (typeof data2 == 'number' && isFinite(data2)) {
        if (data2 < 0 || isNaN(data2)) {
          const err5 = {
            instancePath: instancePath + '/phase',
            schemaPath: '#/properties/phase/minimum',
            keyword: 'minimum',
            params: { comparison: '>=', limit: 0 },
            message: 'must be >= 0',
          };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data2 >= 1 || isNaN(data2)) {
          const err6 = {
            instancePath: instancePath + '/phase',
            schemaPath: '#/properties/phase/exclusiveMaximum',
            keyword: 'exclusiveMaximum',
            params: { comparison: '<', limit: 1 },
            message: 'must be < 1',
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      } else {
        const err7 = {
          instancePath: instancePath + '/phase',
          schemaPath: '#/properties/phase/type',
          keyword: 'type',
          params: { type: 'number' },
          message: 'must be number',
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
  } else {
    const err8 = {
      instancePath,
      schemaPath: '#/type',
      keyword: 'type',
      params: { type: 'object' },
      message: 'must be object',
    };
    if (vErrors === null) {
      vErrors = [err8];
    } else {
      vErrors.push(err8);
    }
    errors++;
  }
  validate41.errors = vErrors;
  return errors === 0;
}
function validate37(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err0 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'id' },
        message: "must have required property '" + 'id' + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.position === undefined) {
      const err1 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'position' },
        message: "must have required property '" + 'position' + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(
        key0 === 'id' ||
        key0 === 'position' ||
        key0 === 'requiredFrom' ||
        key0 === 'radius' ||
        key0 === 'path'
      )) {
        const err2 = {
          instancePath,
          schemaPath: '#/additionalProperties',
          keyword: 'additionalProperties',
          params: { additionalProperty: key0 },
          message: 'must NOT have additional properties',
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      if (
        !validate27(data.id, {
          instancePath: instancePath + '/id',
          parentData: data,
          parentDataProperty: 'id',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
        errors = vErrors.length;
      }
    }
    if (data.position !== undefined) {
      if (
        !validate23(data.position, {
          instancePath: instancePath + '/position',
          parentData: data,
          parentDataProperty: 'position',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
        errors = vErrors.length;
      }
    }
    if (data.requiredFrom !== undefined) {
      if (
        !validate23(data.requiredFrom, {
          instancePath: instancePath + '/requiredFrom',
          parentData: data,
          parentDataProperty: 'requiredFrom',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
        errors = vErrors.length;
      }
    }
    if (data.radius !== undefined) {
      let data3 = data.radius;
      if (typeof data3 == 'number' && isFinite(data3)) {
        if (data3 <= 0 || isNaN(data3)) {
          const err3 = {
            instancePath: instancePath + '/radius',
            schemaPath: '#/properties/radius/exclusiveMinimum',
            keyword: 'exclusiveMinimum',
            params: { comparison: '>', limit: 0 },
            message: 'must be > 0',
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      } else {
        const err4 = {
          instancePath: instancePath + '/radius',
          schemaPath: '#/properties/radius/type',
          keyword: 'type',
          params: { type: 'number' },
          message: 'must be number',
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.path !== undefined) {
      if (
        !validate41(data.path, {
          instancePath: instancePath + '/path',
          parentData: data,
          parentDataProperty: 'path',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate41.errors : vErrors.concat(validate41.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err5 = {
      instancePath,
      schemaPath: '#/type',
      keyword: 'type',
      params: { type: 'object' },
      message: 'must be object',
    };
    if (vErrors === null) {
      vErrors = [err5];
    } else {
      vErrors.push(err5);
    }
    errors++;
  }
  validate37.errors = vErrors;
  return errors === 0;
}
const schema14 = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'kind', 'position', 'size', 'stomp'],
  properties: {
    id: { $ref: '#/definitions/id' },
    kind: { const: 'patroller' },
    position: { $ref: '#/definitions/point' },
    size: { $ref: '#/definitions/point' },
    path: { $ref: '#/definitions/path' },
    stomp: {
      type: 'object',
      additionalProperties: false,
      required: ['minDownSpeed', 'reboundSpeed', 'topInset'],
      properties: {
        minDownSpeed: { type: 'number', exclusiveMinimum: 0 },
        reboundSpeed: { type: 'number', exclusiveMinimum: 0 },
        topInset: { type: 'number', minimum: 0 },
      },
    },
  },
};
function validate45(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err0 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'id' },
        message: "must have required property '" + 'id' + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.kind === undefined) {
      const err1 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'kind' },
        message: "must have required property '" + 'kind' + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.position === undefined) {
      const err2 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'position' },
        message: "must have required property '" + 'position' + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.size === undefined) {
      const err3 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'size' },
        message: "must have required property '" + 'size' + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.stomp === undefined) {
      const err4 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'stomp' },
        message: "must have required property '" + 'stomp' + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(
        key0 === 'id' ||
        key0 === 'kind' ||
        key0 === 'position' ||
        key0 === 'size' ||
        key0 === 'path' ||
        key0 === 'stomp'
      )) {
        const err5 = {
          instancePath,
          schemaPath: '#/additionalProperties',
          keyword: 'additionalProperties',
          params: { additionalProperty: key0 },
          message: 'must NOT have additional properties',
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      if (
        !validate27(data.id, {
          instancePath: instancePath + '/id',
          parentData: data,
          parentDataProperty: 'id',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
        errors = vErrors.length;
      }
    }
    if (data.kind !== undefined) {
      if ('patroller' !== data.kind) {
        const err6 = {
          instancePath: instancePath + '/kind',
          schemaPath: '#/properties/kind/const',
          keyword: 'const',
          params: { allowedValue: 'patroller' },
          message: 'must be equal to constant',
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.position !== undefined) {
      if (
        !validate23(data.position, {
          instancePath: instancePath + '/position',
          parentData: data,
          parentDataProperty: 'position',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
        errors = vErrors.length;
      }
    }
    if (data.size !== undefined) {
      if (
        !validate23(data.size, {
          instancePath: instancePath + '/size',
          parentData: data,
          parentDataProperty: 'size',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
        errors = vErrors.length;
      }
    }
    if (data.path !== undefined) {
      if (
        !validate41(data.path, {
          instancePath: instancePath + '/path',
          parentData: data,
          parentDataProperty: 'path',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate41.errors : vErrors.concat(validate41.errors);
        errors = vErrors.length;
      }
    }
    if (data.stomp !== undefined) {
      let data5 = data.stomp;
      if (data5 && typeof data5 == 'object' && !Array.isArray(data5)) {
        if (data5.minDownSpeed === undefined) {
          const err7 = {
            instancePath: instancePath + '/stomp',
            schemaPath: '#/properties/stomp/required',
            keyword: 'required',
            params: { missingProperty: 'minDownSpeed' },
            message: "must have required property '" + 'minDownSpeed' + "'",
          };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data5.reboundSpeed === undefined) {
          const err8 = {
            instancePath: instancePath + '/stomp',
            schemaPath: '#/properties/stomp/required',
            keyword: 'required',
            params: { missingProperty: 'reboundSpeed' },
            message: "must have required property '" + 'reboundSpeed' + "'",
          };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data5.topInset === undefined) {
          const err9 = {
            instancePath: instancePath + '/stomp',
            schemaPath: '#/properties/stomp/required',
            keyword: 'required',
            params: { missingProperty: 'topInset' },
            message: "must have required property '" + 'topInset' + "'",
          };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        for (const key1 in data5) {
          if (!(key1 === 'minDownSpeed' || key1 === 'reboundSpeed' || key1 === 'topInset')) {
            const err10 = {
              instancePath: instancePath + '/stomp',
              schemaPath: '#/properties/stomp/additionalProperties',
              keyword: 'additionalProperties',
              params: { additionalProperty: key1 },
              message: 'must NOT have additional properties',
            };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data5.minDownSpeed !== undefined) {
          let data6 = data5.minDownSpeed;
          if (typeof data6 == 'number' && isFinite(data6)) {
            if (data6 <= 0 || isNaN(data6)) {
              const err11 = {
                instancePath: instancePath + '/stomp/minDownSpeed',
                schemaPath: '#/properties/stomp/properties/minDownSpeed/exclusiveMinimum',
                keyword: 'exclusiveMinimum',
                params: { comparison: '>', limit: 0 },
                message: 'must be > 0',
              };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          } else {
            const err12 = {
              instancePath: instancePath + '/stomp/minDownSpeed',
              schemaPath: '#/properties/stomp/properties/minDownSpeed/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data5.reboundSpeed !== undefined) {
          let data7 = data5.reboundSpeed;
          if (typeof data7 == 'number' && isFinite(data7)) {
            if (data7 <= 0 || isNaN(data7)) {
              const err13 = {
                instancePath: instancePath + '/stomp/reboundSpeed',
                schemaPath: '#/properties/stomp/properties/reboundSpeed/exclusiveMinimum',
                keyword: 'exclusiveMinimum',
                params: { comparison: '>', limit: 0 },
                message: 'must be > 0',
              };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          } else {
            const err14 = {
              instancePath: instancePath + '/stomp/reboundSpeed',
              schemaPath: '#/properties/stomp/properties/reboundSpeed/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data5.topInset !== undefined) {
          let data8 = data5.topInset;
          if (typeof data8 == 'number' && isFinite(data8)) {
            if (data8 < 0 || isNaN(data8)) {
              const err15 = {
                instancePath: instancePath + '/stomp/topInset',
                schemaPath: '#/properties/stomp/properties/topInset/minimum',
                keyword: 'minimum',
                params: { comparison: '>=', limit: 0 },
                message: 'must be >= 0',
              };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          } else {
            const err16 = {
              instancePath: instancePath + '/stomp/topInset',
              schemaPath: '#/properties/stomp/properties/topInset/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
      } else {
        const err17 = {
          instancePath: instancePath + '/stomp',
          schemaPath: '#/properties/stomp/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
  } else {
    const err18 = {
      instancePath,
      schemaPath: '#/type',
      keyword: 'type',
      params: { type: 'object' },
      message: 'must be object',
    };
    if (vErrors === null) {
      vErrors = [err18];
    } else {
      vErrors.push(err18);
    }
    errors++;
  }
  validate45.errors = vErrors;
  return errors === 0;
}
const schema15 = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'family', 'min', 'max', 'entry'],
  allOf: [
    {
      if: { properties: { family: { const: 'slot' } } },
      then: { properties: { entry: { properties: { side: { enum: ['left', 'right'] } } } } },
    },
    {
      if: { properties: { family: { const: 'shaft' } } },
      then: { properties: { entry: { properties: { side: { enum: ['top', 'bottom'] } } } } },
    },
  ],
  properties: {
    id: { $ref: '#/definitions/id' },
    family: { enum: ['wide', 'slot', 'shaft'] },
    min: { $ref: '#/definitions/point' },
    max: { $ref: '#/definitions/point' },
    entry: {
      type: 'object',
      additionalProperties: false,
      required: ['side', 'angle', 'alignment'],
      properties: {
        side: { enum: ['left', 'right', 'top', 'bottom'] },
        angle: { $ref: '#/definitions/angleWindow' },
        speed: { $ref: '#/definitions/speedWindow' },
        alignment: { $ref: '#/definitions/alignmentWindow' },
      },
    },
  },
};
const schema16 = {
  type: 'object',
  additionalProperties: false,
  required: ['min', 'max'],
  properties: {
    min: { type: 'number', minimum: 0, exclusiveMaximum: 90 },
    max: { type: 'number', minimum: 0, maximum: 90 },
  },
};
function validate56(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.min === undefined) {
      const err0 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'min' },
        message: "must have required property '" + 'min' + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.max === undefined) {
      const err1 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'max' },
        message: "must have required property '" + 'max' + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === 'min' || key0 === 'max')) {
        const err2 = {
          instancePath,
          schemaPath: '#/additionalProperties',
          keyword: 'additionalProperties',
          params: { additionalProperty: key0 },
          message: 'must NOT have additional properties',
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.min !== undefined) {
      let data0 = data.min;
      if (typeof data0 == 'number' && isFinite(data0)) {
        if (data0 < 0 || isNaN(data0)) {
          const err3 = {
            instancePath: instancePath + '/min',
            schemaPath: '#/properties/min/minimum',
            keyword: 'minimum',
            params: { comparison: '>=', limit: 0 },
            message: 'must be >= 0',
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data0 >= 90 || isNaN(data0)) {
          const err4 = {
            instancePath: instancePath + '/min',
            schemaPath: '#/properties/min/exclusiveMaximum',
            keyword: 'exclusiveMaximum',
            params: { comparison: '<', limit: 90 },
            message: 'must be < 90',
          };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      } else {
        const err5 = {
          instancePath: instancePath + '/min',
          schemaPath: '#/properties/min/type',
          keyword: 'type',
          params: { type: 'number' },
          message: 'must be number',
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.max !== undefined) {
      let data1 = data.max;
      if (typeof data1 == 'number' && isFinite(data1)) {
        if (data1 > 90 || isNaN(data1)) {
          const err6 = {
            instancePath: instancePath + '/max',
            schemaPath: '#/properties/max/maximum',
            keyword: 'maximum',
            params: { comparison: '<=', limit: 90 },
            message: 'must be <= 90',
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data1 < 0 || isNaN(data1)) {
          const err7 = {
            instancePath: instancePath + '/max',
            schemaPath: '#/properties/max/minimum',
            keyword: 'minimum',
            params: { comparison: '>=', limit: 0 },
            message: 'must be >= 0',
          };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      } else {
        const err8 = {
          instancePath: instancePath + '/max',
          schemaPath: '#/properties/max/type',
          keyword: 'type',
          params: { type: 'number' },
          message: 'must be number',
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
  } else {
    const err9 = {
      instancePath,
      schemaPath: '#/type',
      keyword: 'type',
      params: { type: 'object' },
      message: 'must be object',
    };
    if (vErrors === null) {
      vErrors = [err9];
    } else {
      vErrors.push(err9);
    }
    errors++;
  }
  validate56.errors = vErrors;
  return errors === 0;
}
const schema17 = {
  type: 'object',
  additionalProperties: false,
  required: ['min', 'max'],
  properties: { min: { type: 'number', minimum: 0 }, max: { type: 'number', exclusiveMinimum: 0 } },
};
function validate58(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.min === undefined) {
      const err0 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'min' },
        message: "must have required property '" + 'min' + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.max === undefined) {
      const err1 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'max' },
        message: "must have required property '" + 'max' + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === 'min' || key0 === 'max')) {
        const err2 = {
          instancePath,
          schemaPath: '#/additionalProperties',
          keyword: 'additionalProperties',
          params: { additionalProperty: key0 },
          message: 'must NOT have additional properties',
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.min !== undefined) {
      let data0 = data.min;
      if (typeof data0 == 'number' && isFinite(data0)) {
        if (data0 < 0 || isNaN(data0)) {
          const err3 = {
            instancePath: instancePath + '/min',
            schemaPath: '#/properties/min/minimum',
            keyword: 'minimum',
            params: { comparison: '>=', limit: 0 },
            message: 'must be >= 0',
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      } else {
        const err4 = {
          instancePath: instancePath + '/min',
          schemaPath: '#/properties/min/type',
          keyword: 'type',
          params: { type: 'number' },
          message: 'must be number',
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.max !== undefined) {
      let data1 = data.max;
      if (typeof data1 == 'number' && isFinite(data1)) {
        if (data1 <= 0 || isNaN(data1)) {
          const err5 = {
            instancePath: instancePath + '/max',
            schemaPath: '#/properties/max/exclusiveMinimum',
            keyword: 'exclusiveMinimum',
            params: { comparison: '>', limit: 0 },
            message: 'must be > 0',
          };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      } else {
        const err6 = {
          instancePath: instancePath + '/max',
          schemaPath: '#/properties/max/type',
          keyword: 'type',
          params: { type: 'number' },
          message: 'must be number',
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
  } else {
    const err7 = {
      instancePath,
      schemaPath: '#/type',
      keyword: 'type',
      params: { type: 'object' },
      message: 'must be object',
    };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  }
  validate58.errors = vErrors;
  return errors === 0;
}
const schema18 = {
  type: 'object',
  additionalProperties: false,
  required: ['min', 'max'],
  properties: {
    min: { type: 'number', minimum: 0, maximum: 1 },
    max: { type: 'number', minimum: 0, maximum: 1 },
  },
};
function validate60(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.min === undefined) {
      const err0 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'min' },
        message: "must have required property '" + 'min' + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.max === undefined) {
      const err1 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'max' },
        message: "must have required property '" + 'max' + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === 'min' || key0 === 'max')) {
        const err2 = {
          instancePath,
          schemaPath: '#/additionalProperties',
          keyword: 'additionalProperties',
          params: { additionalProperty: key0 },
          message: 'must NOT have additional properties',
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.min !== undefined) {
      let data0 = data.min;
      if (typeof data0 == 'number' && isFinite(data0)) {
        if (data0 > 1 || isNaN(data0)) {
          const err3 = {
            instancePath: instancePath + '/min',
            schemaPath: '#/properties/min/maximum',
            keyword: 'maximum',
            params: { comparison: '<=', limit: 1 },
            message: 'must be <= 1',
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data0 < 0 || isNaN(data0)) {
          const err4 = {
            instancePath: instancePath + '/min',
            schemaPath: '#/properties/min/minimum',
            keyword: 'minimum',
            params: { comparison: '>=', limit: 0 },
            message: 'must be >= 0',
          };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      } else {
        const err5 = {
          instancePath: instancePath + '/min',
          schemaPath: '#/properties/min/type',
          keyword: 'type',
          params: { type: 'number' },
          message: 'must be number',
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.max !== undefined) {
      let data1 = data.max;
      if (typeof data1 == 'number' && isFinite(data1)) {
        if (data1 > 1 || isNaN(data1)) {
          const err6 = {
            instancePath: instancePath + '/max',
            schemaPath: '#/properties/max/maximum',
            keyword: 'maximum',
            params: { comparison: '<=', limit: 1 },
            message: 'must be <= 1',
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data1 < 0 || isNaN(data1)) {
          const err7 = {
            instancePath: instancePath + '/max',
            schemaPath: '#/properties/max/minimum',
            keyword: 'minimum',
            params: { comparison: '>=', limit: 0 },
            message: 'must be >= 0',
          };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      } else {
        const err8 = {
          instancePath: instancePath + '/max',
          schemaPath: '#/properties/max/type',
          keyword: 'type',
          params: { type: 'number' },
          message: 'must be number',
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
  } else {
    const err9 = {
      instancePath,
      schemaPath: '#/type',
      keyword: 'type',
      params: { type: 'object' },
      message: 'must be object',
    };
    if (vErrors === null) {
      vErrors = [err9];
    } else {
      vErrors.push(err9);
    }
    errors++;
  }
  validate60.errors = vErrors;
  return errors === 0;
}
function validate52(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs2 = errors;
  let valid1 = true;
  const _errs3 = errors;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.family !== undefined) {
      if ('slot' !== data.family) {
        const err0 = {};
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
  }
  var _valid0 = _errs3 === errors;
  errors = _errs2;
  if (vErrors !== null) {
    if (_errs2) {
      vErrors.length = _errs2;
    } else {
      vErrors = null;
    }
  }
  if (_valid0) {
    const _errs5 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.entry !== undefined) {
        let data1 = data.entry;
        if (data1 && typeof data1 == 'object' && !Array.isArray(data1)) {
          if (data1.side !== undefined) {
            let data2 = data1.side;
            if (!(data2 === 'left' || data2 === 'right')) {
              const err1 = {
                instancePath: instancePath + '/entry/side',
                schemaPath: '#/allOf/0/then/properties/entry/properties/side/enum',
                keyword: 'enum',
                params: {
                  allowedValues: schema15.allOf[0].then.properties.entry.properties.side.enum,
                },
                message: 'must be equal to one of the allowed values',
              };
              if (vErrors === null) {
                vErrors = [err1];
              } else {
                vErrors.push(err1);
              }
              errors++;
            }
          }
        }
      }
    }
    var _valid0 = _errs5 === errors;
    valid1 = _valid0;
  }
  if (!valid1) {
    const err2 = {
      instancePath,
      schemaPath: '#/allOf/0/if',
      keyword: 'if',
      params: { failingKeyword: 'then' },
      message: 'must match "then" schema',
    };
    if (vErrors === null) {
      vErrors = [err2];
    } else {
      vErrors.push(err2);
    }
    errors++;
  }
  const _errs9 = errors;
  let valid5 = true;
  const _errs10 = errors;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.family !== undefined) {
      if ('shaft' !== data.family) {
        const err3 = {};
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
  }
  var _valid1 = _errs10 === errors;
  errors = _errs9;
  if (vErrors !== null) {
    if (_errs9) {
      vErrors.length = _errs9;
    } else {
      vErrors = null;
    }
  }
  if (_valid1) {
    const _errs12 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.entry !== undefined) {
        let data4 = data.entry;
        if (data4 && typeof data4 == 'object' && !Array.isArray(data4)) {
          if (data4.side !== undefined) {
            let data5 = data4.side;
            if (!(data5 === 'top' || data5 === 'bottom')) {
              const err4 = {
                instancePath: instancePath + '/entry/side',
                schemaPath: '#/allOf/1/then/properties/entry/properties/side/enum',
                keyword: 'enum',
                params: {
                  allowedValues: schema15.allOf[1].then.properties.entry.properties.side.enum,
                },
                message: 'must be equal to one of the allowed values',
              };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
          }
        }
      }
    }
    var _valid1 = _errs12 === errors;
    valid5 = _valid1;
  }
  if (!valid5) {
    const err5 = {
      instancePath,
      schemaPath: '#/allOf/1/if',
      keyword: 'if',
      params: { failingKeyword: 'then' },
      message: 'must match "then" schema',
    };
    if (vErrors === null) {
      vErrors = [err5];
    } else {
      vErrors.push(err5);
    }
    errors++;
  }
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err6 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'id' },
        message: "must have required property '" + 'id' + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.family === undefined) {
      const err7 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'family' },
        message: "must have required property '" + 'family' + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.min === undefined) {
      const err8 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'min' },
        message: "must have required property '" + 'min' + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.max === undefined) {
      const err9 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'max' },
        message: "must have required property '" + 'max' + "'",
      };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    if (data.entry === undefined) {
      const err10 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'entry' },
        message: "must have required property '" + 'entry' + "'",
      };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(
        key0 === 'id' ||
        key0 === 'family' ||
        key0 === 'min' ||
        key0 === 'max' ||
        key0 === 'entry'
      )) {
        const err11 = {
          instancePath,
          schemaPath: '#/additionalProperties',
          keyword: 'additionalProperties',
          params: { additionalProperty: key0 },
          message: 'must NOT have additional properties',
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      if (
        !validate27(data.id, {
          instancePath: instancePath + '/id',
          parentData: data,
          parentDataProperty: 'id',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
        errors = vErrors.length;
      }
    }
    if (data.family !== undefined) {
      let data7 = data.family;
      if (!(data7 === 'wide' || data7 === 'slot' || data7 === 'shaft')) {
        const err12 = {
          instancePath: instancePath + '/family',
          schemaPath: '#/properties/family/enum',
          keyword: 'enum',
          params: { allowedValues: schema15.properties.family.enum },
          message: 'must be equal to one of the allowed values',
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.min !== undefined) {
      if (
        !validate23(data.min, {
          instancePath: instancePath + '/min',
          parentData: data,
          parentDataProperty: 'min',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
        errors = vErrors.length;
      }
    }
    if (data.max !== undefined) {
      if (
        !validate23(data.max, {
          instancePath: instancePath + '/max',
          parentData: data,
          parentDataProperty: 'max',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
        errors = vErrors.length;
      }
    }
    if (data.entry !== undefined) {
      let data10 = data.entry;
      if (data10 && typeof data10 == 'object' && !Array.isArray(data10)) {
        if (data10.side === undefined) {
          const err13 = {
            instancePath: instancePath + '/entry',
            schemaPath: '#/properties/entry/required',
            keyword: 'required',
            params: { missingProperty: 'side' },
            message: "must have required property '" + 'side' + "'",
          };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        if (data10.angle === undefined) {
          const err14 = {
            instancePath: instancePath + '/entry',
            schemaPath: '#/properties/entry/required',
            keyword: 'required',
            params: { missingProperty: 'angle' },
            message: "must have required property '" + 'angle' + "'",
          };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        if (data10.alignment === undefined) {
          const err15 = {
            instancePath: instancePath + '/entry',
            schemaPath: '#/properties/entry/required',
            keyword: 'required',
            params: { missingProperty: 'alignment' },
            message: "must have required property '" + 'alignment' + "'",
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
        for (const key1 in data10) {
          if (!(key1 === 'side' || key1 === 'angle' || key1 === 'speed' || key1 === 'alignment')) {
            const err16 = {
              instancePath: instancePath + '/entry',
              schemaPath: '#/properties/entry/additionalProperties',
              keyword: 'additionalProperties',
              params: { additionalProperty: key1 },
              message: 'must NOT have additional properties',
            };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data10.side !== undefined) {
          let data11 = data10.side;
          if (!(
            data11 === 'left' ||
            data11 === 'right' ||
            data11 === 'top' ||
            data11 === 'bottom'
          )) {
            const err17 = {
              instancePath: instancePath + '/entry/side',
              schemaPath: '#/properties/entry/properties/side/enum',
              keyword: 'enum',
              params: { allowedValues: schema15.properties.entry.properties.side.enum },
              message: 'must be equal to one of the allowed values',
            };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data10.angle !== undefined) {
          if (
            !validate56(data10.angle, {
              instancePath: instancePath + '/entry/angle',
              parentData: data10,
              parentDataProperty: 'angle',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate56.errors : vErrors.concat(validate56.errors);
            errors = vErrors.length;
          }
        }
        if (data10.speed !== undefined) {
          if (
            !validate58(data10.speed, {
              instancePath: instancePath + '/entry/speed',
              parentData: data10,
              parentDataProperty: 'speed',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate58.errors : vErrors.concat(validate58.errors);
            errors = vErrors.length;
          }
        }
        if (data10.alignment !== undefined) {
          if (
            !validate60(data10.alignment, {
              instancePath: instancePath + '/entry/alignment',
              parentData: data10,
              parentDataProperty: 'alignment',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate60.errors : vErrors.concat(validate60.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err18 = {
          instancePath: instancePath + '/entry',
          schemaPath: '#/properties/entry/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
    }
  } else {
    const err19 = {
      instancePath,
      schemaPath: '#/type',
      keyword: 'type',
      params: { type: 'object' },
      message: 'must be object',
    };
    if (vErrors === null) {
      vErrors = [err19];
    } else {
      vErrors.push(err19);
    }
    errors++;
  }
  validate52.errors = vErrors;
  return errors === 0;
}
const func2 = Object.prototype.hasOwnProperty;
function validate21(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  /*# sourceURL="https://stickgame.dev/schemas/level.json" */ let vErrors = null;
  let errors = 0;
  const _errs2 = errors;
  let valid1 = true;
  const _errs3 = errors;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.version !== undefined) {
      if (1 !== data.version) {
        const err0 = {};
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
  }
  var _valid0 = _errs3 === errors;
  errors = _errs2;
  if (vErrors !== null) {
    if (_errs2) {
      vErrors.length = _errs2;
    } else {
      vErrors = null;
    }
  }
  if (_valid0) {
    const _errs5 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.exit !== undefined) {
        if (
          !validate22(data.exit, {
            instancePath: instancePath + '/exit',
            parentData: data,
            parentDataProperty: 'exit',
            rootData,
          })
        ) {
          vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
          errors = vErrors.length;
        }
      }
      if (data.enemies !== undefined) {
        const err1 = {
          instancePath: instancePath + '/enemies',
          schemaPath: '#/allOf/0/then/properties/enemies/false schema',
          keyword: 'false schema',
          params: {},
          message: 'boolean schema is false',
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs5 === errors;
    valid1 = _valid0;
  }
  if (!valid1) {
    const err2 = {
      instancePath,
      schemaPath: '#/allOf/0/if',
      keyword: 'if',
      params: { failingKeyword: 'then' },
      message: 'must match "then" schema',
    };
    if (vErrors === null) {
      vErrors = [err2];
    } else {
      vErrors.push(err2);
    }
    errors++;
  }
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.version === undefined) {
      const err3 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'version' },
        message: "must have required property '" + 'version' + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.id === undefined) {
      const err4 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'id' },
        message: "must have required property '" + 'id' + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.name === undefined) {
      const err5 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'name' },
        message: "must have required property '" + 'name' + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.spawn === undefined) {
      const err6 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'spawn' },
        message: "must have required property '" + 'spawn' + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.bounds === undefined) {
      const err7 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'bounds' },
        message: "must have required property '" + 'bounds' + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.killY === undefined) {
      const err8 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'killY' },
        message: "must have required property '" + 'killY' + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.solids === undefined) {
      const err9 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'solids' },
        message: "must have required property '" + 'solids' + "'",
      };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func2.call(schema6.properties, key0)) {
        const err10 = {
          instancePath,
          schemaPath: '#/additionalProperties',
          keyword: 'additionalProperties',
          params: { additionalProperty: key0 },
          message: 'must NOT have additional properties',
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.$schema !== undefined) {
      if (typeof data.$schema !== 'string') {
        const err11 = {
          instancePath: instancePath + '/$schema',
          schemaPath: '#/properties/%24schema/type',
          keyword: 'type',
          params: { type: 'string' },
          message: 'must be string',
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.version !== undefined) {
      let data4 = data.version;
      if (!(data4 === 1 || data4 === 2)) {
        const err12 = {
          instancePath: instancePath + '/version',
          schemaPath: '#/properties/version/enum',
          keyword: 'enum',
          params: { allowedValues: schema6.properties.version.enum },
          message: 'must be equal to one of the allowed values',
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      if (
        !validate27(data.id, {
          instancePath: instancePath + '/id',
          parentData: data,
          parentDataProperty: 'id',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
        errors = vErrors.length;
      }
    }
    if (data.name !== undefined) {
      if (
        !validate29(data.name, {
          instancePath: instancePath + '/name',
          parentData: data,
          parentDataProperty: 'name',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
        errors = vErrors.length;
      }
    }
    if (data.spawn !== undefined) {
      if (
        !validate23(data.spawn, {
          instancePath: instancePath + '/spawn',
          parentData: data,
          parentDataProperty: 'spawn',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
        errors = vErrors.length;
      }
    }
    if (data.bounds !== undefined) {
      let data8 = data.bounds;
      if (data8 && typeof data8 == 'object' && !Array.isArray(data8)) {
        if (data8.minX === undefined) {
          const err13 = {
            instancePath: instancePath + '/bounds',
            schemaPath: '#/properties/bounds/required',
            keyword: 'required',
            params: { missingProperty: 'minX' },
            message: "must have required property '" + 'minX' + "'",
          };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        if (data8.minY === undefined) {
          const err14 = {
            instancePath: instancePath + '/bounds',
            schemaPath: '#/properties/bounds/required',
            keyword: 'required',
            params: { missingProperty: 'minY' },
            message: "must have required property '" + 'minY' + "'",
          };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        if (data8.maxX === undefined) {
          const err15 = {
            instancePath: instancePath + '/bounds',
            schemaPath: '#/properties/bounds/required',
            keyword: 'required',
            params: { missingProperty: 'maxX' },
            message: "must have required property '" + 'maxX' + "'",
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
        if (data8.maxY === undefined) {
          const err16 = {
            instancePath: instancePath + '/bounds',
            schemaPath: '#/properties/bounds/required',
            keyword: 'required',
            params: { missingProperty: 'maxY' },
            message: "must have required property '" + 'maxY' + "'",
          };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        for (const key1 in data8) {
          if (!(key1 === 'minX' || key1 === 'minY' || key1 === 'maxX' || key1 === 'maxY')) {
            const err17 = {
              instancePath: instancePath + '/bounds',
              schemaPath: '#/properties/bounds/additionalProperties',
              keyword: 'additionalProperties',
              params: { additionalProperty: key1 },
              message: 'must NOT have additional properties',
            };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data8.minX !== undefined) {
          let data9 = data8.minX;
          if (!(typeof data9 == 'number' && isFinite(data9))) {
            const err18 = {
              instancePath: instancePath + '/bounds/minX',
              schemaPath: '#/properties/bounds/properties/minX/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data8.minY !== undefined) {
          let data10 = data8.minY;
          if (!(typeof data10 == 'number' && isFinite(data10))) {
            const err19 = {
              instancePath: instancePath + '/bounds/minY',
              schemaPath: '#/properties/bounds/properties/minY/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
        if (data8.maxX !== undefined) {
          let data11 = data8.maxX;
          if (!(typeof data11 == 'number' && isFinite(data11))) {
            const err20 = {
              instancePath: instancePath + '/bounds/maxX',
              schemaPath: '#/properties/bounds/properties/maxX/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
        if (data8.maxY !== undefined) {
          let data12 = data8.maxY;
          if (!(typeof data12 == 'number' && isFinite(data12))) {
            const err21 = {
              instancePath: instancePath + '/bounds/maxY',
              schemaPath: '#/properties/bounds/properties/maxY/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
        }
      } else {
        const err22 = {
          instancePath: instancePath + '/bounds',
          schemaPath: '#/properties/bounds/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
    }
    if (data.killY !== undefined) {
      let data13 = data.killY;
      if (!(typeof data13 == 'number' && isFinite(data13))) {
        const err23 = {
          instancePath: instancePath + '/killY',
          schemaPath: '#/properties/killY/type',
          keyword: 'type',
          params: { type: 'number' },
          message: 'must be number',
        };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    if (data.solids !== undefined) {
      let data14 = data.solids;
      if (Array.isArray(data14)) {
        const len0 = data14.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate32(data14[i0], {
              instancePath: instancePath + '/solids/' + i0,
              parentData: data14,
              parentDataProperty: i0,
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate32.errors : vErrors.concat(validate32.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err24 = {
          instancePath: instancePath + '/solids',
          schemaPath: '#/properties/solids/type',
          keyword: 'type',
          params: { type: 'array' },
          message: 'must be array',
        };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
    }
    if (data.anchors !== undefined) {
      let data16 = data.anchors;
      if (Array.isArray(data16)) {
        const len1 = data16.length;
        for (let i1 = 0; i1 < len1; i1++) {
          if (
            !validate37(data16[i1], {
              instancePath: instancePath + '/anchors/' + i1,
              parentData: data16,
              parentDataProperty: i1,
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate37.errors : vErrors.concat(validate37.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err25 = {
          instancePath: instancePath + '/anchors',
          schemaPath: '#/properties/anchors/type',
          keyword: 'type',
          params: { type: 'array' },
          message: 'must be array',
        };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
    if (data.enemies !== undefined) {
      let data18 = data.enemies;
      if (Array.isArray(data18)) {
        const len2 = data18.length;
        for (let i2 = 0; i2 < len2; i2++) {
          if (
            !validate45(data18[i2], {
              instancePath: instancePath + '/enemies/' + i2,
              parentData: data18,
              parentDataProperty: i2,
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate45.errors : vErrors.concat(validate45.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err26 = {
          instancePath: instancePath + '/enemies',
          schemaPath: '#/properties/enemies/type',
          keyword: 'type',
          params: { type: 'array' },
          message: 'must be array',
        };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      }
    }
    if (data.exit !== undefined) {
      let data20 = data.exit;
      const _errs37 = errors;
      let valid12 = false;
      let passing0 = null;
      const _errs38 = errors;
      if (
        !validate22(data20, {
          instancePath: instancePath + '/exit',
          parentData: data,
          parentDataProperty: 'exit',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
        errors = vErrors.length;
      }
      var _valid1 = _errs38 === errors;
      if (_valid1) {
        valid12 = true;
        passing0 = 0;
      }
      const _errs39 = errors;
      if (
        !validate52(data20, {
          instancePath: instancePath + '/exit',
          parentData: data,
          parentDataProperty: 'exit',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate52.errors : vErrors.concat(validate52.errors);
        errors = vErrors.length;
      }
      var _valid1 = _errs39 === errors;
      if (_valid1 && valid12) {
        valid12 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid1) {
          valid12 = true;
          passing0 = 1;
        }
      }
      if (!valid12) {
        const err27 = {
          instancePath: instancePath + '/exit',
          schemaPath: '#/properties/exit/oneOf',
          keyword: 'oneOf',
          params: { passingSchemas: passing0 },
          message: 'must match exactly one schema in oneOf',
        };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      } else {
        errors = _errs37;
        if (vErrors !== null) {
          if (_errs37) {
            vErrors.length = _errs37;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.section !== undefined) {
      if (
        !validate27(data.section, {
          instancePath: instancePath + '/section',
          parentData: data,
          parentDataProperty: 'section',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
        errors = vErrors.length;
      }
    }
    if (data.telemetry !== undefined) {
      let data22 = data.telemetry;
      if (data22 && typeof data22 == 'object' && !Array.isArray(data22)) {
        if (data22.levelId === undefined) {
          const err28 = {
            instancePath: instancePath + '/telemetry',
            schemaPath: '#/properties/telemetry/required',
            keyword: 'required',
            params: { missingProperty: 'levelId' },
            message: "must have required property '" + 'levelId' + "'",
          };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
        for (const key2 in data22) {
          if (!(key2 === 'levelId')) {
            const err29 = {
              instancePath: instancePath + '/telemetry',
              schemaPath: '#/properties/telemetry/additionalProperties',
              keyword: 'additionalProperties',
              params: { additionalProperty: key2 },
              message: 'must NOT have additional properties',
            };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        }
        if (data22.levelId !== undefined) {
          if (
            !validate27(data22.levelId, {
              instancePath: instancePath + '/telemetry/levelId',
              parentData: data22,
              parentDataProperty: 'levelId',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err30 = {
          instancePath: instancePath + '/telemetry',
          schemaPath: '#/properties/telemetry/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err30];
        } else {
          vErrors.push(err30);
        }
        errors++;
      }
    }
    if (data.chambers !== undefined) {
      let data24 = data.chambers;
      if (Array.isArray(data24)) {
        const len3 = data24.length;
        for (let i3 = 0; i3 < len3; i3++) {
          let data25 = data24[i3];
          if (data25 && typeof data25 == 'object' && !Array.isArray(data25)) {
            if (data25.id === undefined) {
              const err31 = {
                instancePath: instancePath + '/chambers/' + i3,
                schemaPath: '#/properties/chambers/items/required',
                keyword: 'required',
                params: { missingProperty: 'id' },
                message: "must have required property '" + 'id' + "'",
              };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
            if (data25.region === undefined) {
              const err32 = {
                instancePath: instancePath + '/chambers/' + i3,
                schemaPath: '#/properties/chambers/items/required',
                keyword: 'required',
                params: { missingProperty: 'region' },
                message: "must have required property '" + 'region' + "'",
              };
              if (vErrors === null) {
                vErrors = [err32];
              } else {
                vErrors.push(err32);
              }
              errors++;
            }
            if (data25.problem === undefined) {
              const err33 = {
                instancePath: instancePath + '/chambers/' + i3,
                schemaPath: '#/properties/chambers/items/required',
                keyword: 'required',
                params: { missingProperty: 'problem' },
                message: "must have required property '" + 'problem' + "'",
              };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
            if (data25.challengeFamily === undefined) {
              const err34 = {
                instancePath: instancePath + '/chambers/' + i3,
                schemaPath: '#/properties/chambers/items/required',
                keyword: 'required',
                params: { missingProperty: 'challengeFamily' },
                message: "must have required property '" + 'challengeFamily' + "'",
              };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
            for (const key3 in data25) {
              if (!(
                key3 === 'id' ||
                key3 === 'region' ||
                key3 === 'problem' ||
                key3 === 'challengeFamily'
              )) {
                const err35 = {
                  instancePath: instancePath + '/chambers/' + i3,
                  schemaPath: '#/properties/chambers/items/additionalProperties',
                  keyword: 'additionalProperties',
                  params: { additionalProperty: key3 },
                  message: 'must NOT have additional properties',
                };
                if (vErrors === null) {
                  vErrors = [err35];
                } else {
                  vErrors.push(err35);
                }
                errors++;
              }
            }
            if (data25.id !== undefined) {
              if (
                !validate27(data25.id, {
                  instancePath: instancePath + '/chambers/' + i3 + '/id',
                  parentData: data25,
                  parentDataProperty: 'id',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
                errors = vErrors.length;
              }
            }
            if (data25.region !== undefined) {
              if (
                !validate22(data25.region, {
                  instancePath: instancePath + '/chambers/' + i3 + '/region',
                  parentData: data25,
                  parentDataProperty: 'region',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
                errors = vErrors.length;
              }
            }
            if (data25.problem !== undefined) {
              if (
                !validate29(data25.problem, {
                  instancePath: instancePath + '/chambers/' + i3 + '/problem',
                  parentData: data25,
                  parentDataProperty: 'problem',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
                errors = vErrors.length;
              }
            }
            if (data25.challengeFamily !== undefined) {
              if (
                !validate29(data25.challengeFamily, {
                  instancePath: instancePath + '/chambers/' + i3 + '/challengeFamily',
                  parentData: data25,
                  parentDataProperty: 'challengeFamily',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err36 = {
              instancePath: instancePath + '/chambers/' + i3,
              schemaPath: '#/properties/chambers/items/type',
              keyword: 'type',
              params: { type: 'object' },
              message: 'must be object',
            };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
        }
      } else {
        const err37 = {
          instancePath: instancePath + '/chambers',
          schemaPath: '#/properties/chambers/type',
          keyword: 'type',
          params: { type: 'array' },
          message: 'must be array',
        };
        if (vErrors === null) {
          vErrors = [err37];
        } else {
          vErrors.push(err37);
        }
        errors++;
      }
    }
    if (data.checkpoints !== undefined) {
      let data30 = data.checkpoints;
      if (Array.isArray(data30)) {
        const len4 = data30.length;
        for (let i4 = 0; i4 < len4; i4++) {
          let data31 = data30[i4];
          if (data31 && typeof data31 == 'object' && !Array.isArray(data31)) {
            if (data31.id === undefined) {
              const err38 = {
                instancePath: instancePath + '/checkpoints/' + i4,
                schemaPath: '#/properties/checkpoints/items/required',
                keyword: 'required',
                params: { missingProperty: 'id' },
                message: "must have required property '" + 'id' + "'",
              };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
            if (data31.position === undefined) {
              const err39 = {
                instancePath: instancePath + '/checkpoints/' + i4,
                schemaPath: '#/properties/checkpoints/items/required',
                keyword: 'required',
                params: { missingProperty: 'position' },
                message: "must have required property '" + 'position' + "'",
              };
              if (vErrors === null) {
                vErrors = [err39];
              } else {
                vErrors.push(err39);
              }
              errors++;
            }
            for (const key4 in data31) {
              if (!(key4 === 'id' || key4 === 'position')) {
                const err40 = {
                  instancePath: instancePath + '/checkpoints/' + i4,
                  schemaPath: '#/properties/checkpoints/items/additionalProperties',
                  keyword: 'additionalProperties',
                  params: { additionalProperty: key4 },
                  message: 'must NOT have additional properties',
                };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
            }
            if (data31.id !== undefined) {
              if (
                !validate27(data31.id, {
                  instancePath: instancePath + '/checkpoints/' + i4 + '/id',
                  parentData: data31,
                  parentDataProperty: 'id',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
                errors = vErrors.length;
              }
            }
            if (data31.position !== undefined) {
              if (
                !validate23(data31.position, {
                  instancePath: instancePath + '/checkpoints/' + i4 + '/position',
                  parentData: data31,
                  parentDataProperty: 'position',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err41 = {
              instancePath: instancePath + '/checkpoints/' + i4,
              schemaPath: '#/properties/checkpoints/items/type',
              keyword: 'type',
              params: { type: 'object' },
              message: 'must be object',
            };
            if (vErrors === null) {
              vErrors = [err41];
            } else {
              vErrors.push(err41);
            }
            errors++;
          }
        }
      } else {
        const err42 = {
          instancePath: instancePath + '/checkpoints',
          schemaPath: '#/properties/checkpoints/type',
          keyword: 'type',
          params: { type: 'array' },
          message: 'must be array',
        };
        if (vErrors === null) {
          vErrors = [err42];
        } else {
          vErrors.push(err42);
        }
        errors++;
      }
    }
    if (data.tunnels !== undefined) {
      let data34 = data.tunnels;
      if (Array.isArray(data34)) {
        const len5 = data34.length;
        for (let i5 = 0; i5 < len5; i5++) {
          let data35 = data34[i5];
          if (data35 && typeof data35 == 'object' && !Array.isArray(data35)) {
            if (data35.id === undefined) {
              const err43 = {
                instancePath: instancePath + '/tunnels/' + i5,
                schemaPath: '#/properties/tunnels/items/required',
                keyword: 'required',
                params: { missingProperty: 'id' },
                message: "must have required property '" + 'id' + "'",
              };
              if (vErrors === null) {
                vErrors = [err43];
              } else {
                vErrors.push(err43);
              }
              errors++;
            }
            if (data35.region === undefined) {
              const err44 = {
                instancePath: instancePath + '/tunnels/' + i5,
                schemaPath: '#/properties/tunnels/items/required',
                keyword: 'required',
                params: { missingProperty: 'region' },
                message: "must have required property '" + 'region' + "'",
              };
              if (vErrors === null) {
                vErrors = [err44];
              } else {
                vErrors.push(err44);
              }
              errors++;
            }
            for (const key5 in data35) {
              if (!(key5 === 'id' || key5 === 'region')) {
                const err45 = {
                  instancePath: instancePath + '/tunnels/' + i5,
                  schemaPath: '#/properties/tunnels/items/additionalProperties',
                  keyword: 'additionalProperties',
                  params: { additionalProperty: key5 },
                  message: 'must NOT have additional properties',
                };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
            }
            if (data35.id !== undefined) {
              if (
                !validate27(data35.id, {
                  instancePath: instancePath + '/tunnels/' + i5 + '/id',
                  parentData: data35,
                  parentDataProperty: 'id',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
                errors = vErrors.length;
              }
            }
            if (data35.region !== undefined) {
              if (
                !validate22(data35.region, {
                  instancePath: instancePath + '/tunnels/' + i5 + '/region',
                  parentData: data35,
                  parentDataProperty: 'region',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err46 = {
              instancePath: instancePath + '/tunnels/' + i5,
              schemaPath: '#/properties/tunnels/items/type',
              keyword: 'type',
              params: { type: 'object' },
              message: 'must be object',
            };
            if (vErrors === null) {
              vErrors = [err46];
            } else {
              vErrors.push(err46);
            }
            errors++;
          }
        }
      } else {
        const err47 = {
          instancePath: instancePath + '/tunnels',
          schemaPath: '#/properties/tunnels/type',
          keyword: 'type',
          params: { type: 'array' },
          message: 'must be array',
        };
        if (vErrors === null) {
          vErrors = [err47];
        } else {
          vErrors.push(err47);
        }
        errors++;
      }
    }
    if (data.cameraHints !== undefined) {
      let data38 = data.cameraHints;
      if (Array.isArray(data38)) {
        const len6 = data38.length;
        for (let i6 = 0; i6 < len6; i6++) {
          let data39 = data38[i6];
          if (data39 && typeof data39 == 'object' && !Array.isArray(data39)) {
            if (data39.id === undefined) {
              const err48 = {
                instancePath: instancePath + '/cameraHints/' + i6,
                schemaPath: '#/properties/cameraHints/items/required',
                keyword: 'required',
                params: { missingProperty: 'id' },
                message: "must have required property '" + 'id' + "'",
              };
              if (vErrors === null) {
                vErrors = [err48];
              } else {
                vErrors.push(err48);
              }
              errors++;
            }
            if (data39.region === undefined) {
              const err49 = {
                instancePath: instancePath + '/cameraHints/' + i6,
                schemaPath: '#/properties/cameraHints/items/required',
                keyword: 'required',
                params: { missingProperty: 'region' },
                message: "must have required property '" + 'region' + "'",
              };
              if (vErrors === null) {
                vErrors = [err49];
              } else {
                vErrors.push(err49);
              }
              errors++;
            }
            if (data39.focus === undefined) {
              const err50 = {
                instancePath: instancePath + '/cameraHints/' + i6,
                schemaPath: '#/properties/cameraHints/items/required',
                keyword: 'required',
                params: { missingProperty: 'focus' },
                message: "must have required property '" + 'focus' + "'",
              };
              if (vErrors === null) {
                vErrors = [err50];
              } else {
                vErrors.push(err50);
              }
              errors++;
            }
            for (const key6 in data39) {
              if (!(key6 === 'id' || key6 === 'region' || key6 === 'focus')) {
                const err51 = {
                  instancePath: instancePath + '/cameraHints/' + i6,
                  schemaPath: '#/properties/cameraHints/items/additionalProperties',
                  keyword: 'additionalProperties',
                  params: { additionalProperty: key6 },
                  message: 'must NOT have additional properties',
                };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
            }
            if (data39.id !== undefined) {
              if (
                !validate27(data39.id, {
                  instancePath: instancePath + '/cameraHints/' + i6 + '/id',
                  parentData: data39,
                  parentDataProperty: 'id',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
                errors = vErrors.length;
              }
            }
            if (data39.region !== undefined) {
              if (
                !validate22(data39.region, {
                  instancePath: instancePath + '/cameraHints/' + i6 + '/region',
                  parentData: data39,
                  parentDataProperty: 'region',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
                errors = vErrors.length;
              }
            }
            if (data39.focus !== undefined) {
              if (
                !validate23(data39.focus, {
                  instancePath: instancePath + '/cameraHints/' + i6 + '/focus',
                  parentData: data39,
                  parentDataProperty: 'focus',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err52 = {
              instancePath: instancePath + '/cameraHints/' + i6,
              schemaPath: '#/properties/cameraHints/items/type',
              keyword: 'type',
              params: { type: 'object' },
              message: 'must be object',
            };
            if (vErrors === null) {
              vErrors = [err52];
            } else {
              vErrors.push(err52);
            }
            errors++;
          }
        }
      } else {
        const err53 = {
          instancePath: instancePath + '/cameraHints',
          schemaPath: '#/properties/cameraHints/type',
          keyword: 'type',
          params: { type: 'array' },
          message: 'must be array',
        };
        if (vErrors === null) {
          vErrors = [err53];
        } else {
          vErrors.push(err53);
        }
        errors++;
      }
    }
  } else {
    const err54 = {
      instancePath,
      schemaPath: '#/type',
      keyword: 'type',
      params: { type: 'object' },
      message: 'must be object',
    };
    if (vErrors === null) {
      vErrors = [err54];
    } else {
      vErrors.push(err54);
    }
    errors++;
  }
  validate21.errors = vErrors;
  return errors === 0;
}
