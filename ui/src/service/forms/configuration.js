
import React from 'react';
import PropTypes from 'prop-types';
import exact from 'prop-types-exact';

import {connect} from 'react-redux';

import {highlight, languages} from 'prismjs/components/prism-core';

import {PlaygroundContext} from '../../app';
import {updateForm} from '../../app/store';
import {PlaygroundEditor} from '../../shared/editor';


// VALIDATION REQUIRED
//  - config:
//      - not too long


export class BaseServiceConfigurationForm extends React.PureComponent {
    static contextType = PlaygroundContext;
    static propTypes = exact({
        dispatch: PropTypes.func.isRequired,
        form: PropTypes.object.isRequired,
        service_types: PropTypes.object.isRequired,
    });

    get messages () {
        return ["Add configuration for the service"];
    }

    onConfigChange = async (code) => {
        const {dispatch} = this.props;
        dispatch(updateForm({configuration: code}));
    }

    async componentDidMount () {
        const {api} = this.context;
        const {dispatch, form, service_types} = this.props;
        const {configuration, service_type} = form;
        if (configuration) {
            return;
        }
        const configDefault  = service_types[service_type]['labels']['envoy.playground.config.default'];
        if (configDefault) {
            console.log(configDefault);
            const content = await api.get(
                ['/static', service_type, configDefault].join('/'),
                'text');
            await dispatch(updateForm({configuration: content}));
        }
    }

    onHighlight = (code) => {
        const {form, service_types} = this.props;
        const {service_type} = form;
        if (!service_type) {
            return code;
        }
        const configHighlight  = service_types[service_type]['labels']['envoy.playground.config.highlight'];
        if (!configHighlight) {
            return code;
        }
        return highlight(code, languages[configHighlight]);
    }

    render () {
        const {form} = this.props;
        const {configuration='', errors} = form;
        const {configuration: configErrors=[]} =  errors;
        return (
            <PlaygroundEditor
              title="Configuration"
              name="configuration"
              content={configuration}
              clearConfig={this.clearConfig}
              onChange={this.onConfigChange}
              onHighlight={this.onHighlight}
              errors={configErrors}
            />
        );
    }
}


export const mapStateToProps = function(state, other) {
    return {
        form: state.form.value,
        service_types: state.service_type.value,
    };
};

export default connect(mapStateToProps)(BaseServiceConfigurationForm);
