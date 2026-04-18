<?php
/**
 * Plugin Name: Hercules Order Pay Address
 * Description: Adds billing & shipping address fields to the WooCommerce order-pay page (like checkout) so customers can update their address before paying.
 * Version: 3.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Display billing + shipping address fields on the order-pay page.
 */
add_action( 'before_woocommerce_pay', 'hercules_order_pay_address_fields' );

function hercules_order_pay_address_fields() {
    global $wp;

    $order_id = absint( $wp->query_vars['order-pay'] ?? 0 );
    if ( ! $order_id ) {
        return;
    }

    $order = wc_get_order( $order_id );
    if ( ! $order ) {
        return;
    }

    // Check if shipping address differs from billing
    $has_shipping = (
        $order->get_shipping_first_name() ||
        $order->get_shipping_address_1() ||
        $order->get_shipping_city()
    );

    $countries_obj = new WC_Countries();
    $countries     = $countries_obj->get_allowed_countries();
    $states        = $countries_obj->get_states();

    $billing_country = $order->get_billing_country() ?: WC()->countries->get_base_country();

    $billing_fields = [
        'billing_first_name' => [
            'label'    => __( 'First name', 'woocommerce' ),
            'value'    => $order->get_billing_first_name(),
            'required' => true,
            'class'    => 'form-row-first',
        ],
        'billing_last_name' => [
            'label'    => __( 'Last name', 'woocommerce' ),
            'value'    => $order->get_billing_last_name(),
            'required' => true,
            'class'    => 'form-row-last',
        ],
        'billing_company' => [
            'label'    => __( 'Company name', 'woocommerce' ),
            'value'    => $order->get_billing_company(),
            'required' => false,
            'class'    => 'form-row-wide',
        ],
        'billing_country' => [
            'label'    => __( 'Country / Region', 'woocommerce' ),
            'value'    => $billing_country,
            'required' => true,
            'type'     => 'country',
            'class'    => 'form-row-wide',
        ],
        'billing_address_1' => [
            'label'       => __( 'Street address', 'woocommerce' ),
            'value'       => $order->get_billing_address_1(),
            'required'    => true,
            'class'       => 'form-row-wide',
            'placeholder' => __( 'House number and street name', 'woocommerce' ),
        ],
        'billing_address_2' => [
            'label'       => '',
            'value'       => $order->get_billing_address_2(),
            'required'    => false,
            'class'       => 'form-row-wide',
            'placeholder' => __( 'Apartment, suite, unit, etc. (optional)', 'woocommerce' ),
        ],
        'billing_postcode' => [
            'label'    => __( 'Postcode / ZIP', 'woocommerce' ),
            'value'    => $order->get_billing_postcode(),
            'required' => true,
            'class'    => 'form-row-first',
        ],
        'billing_city' => [
            'label'    => __( 'Town / City', 'woocommerce' ),
            'value'    => $order->get_billing_city(),
            'required' => true,
            'class'    => 'form-row-last',
        ],
        'billing_state' => [
            'label'    => __( 'State / County', 'woocommerce' ),
            'value'    => $order->get_billing_state(),
            'required' => false,
            'type'     => 'state',
            'class'    => 'form-row-wide',
        ],
        'billing_phone' => [
            'label'    => __( 'Phone', 'woocommerce' ),
            'value'    => $order->get_billing_phone(),
            'required' => false,
            'class'    => 'form-row-wide',
            'type'     => 'tel',
        ],
        'billing_email' => [
            'label'    => __( 'Email address', 'woocommerce' ),
            'value'    => $order->get_billing_email(),
            'required' => true,
            'class'    => 'form-row-wide',
            'type'     => 'email',
        ],
    ];

    $shipping_country = $order->get_shipping_country() ?: $billing_country;

    $shipping_fields = [
        'shipping_first_name' => [
            'label'    => __( 'First name', 'woocommerce' ),
            'value'    => $order->get_shipping_first_name(),
            'required' => true,
            'class'    => 'form-row-first',
        ],
        'shipping_last_name' => [
            'label'    => __( 'Last name', 'woocommerce' ),
            'value'    => $order->get_shipping_last_name(),
            'required' => true,
            'class'    => 'form-row-last',
        ],
        'shipping_company' => [
            'label'    => __( 'Company name', 'woocommerce' ),
            'value'    => $order->get_shipping_company(),
            'required' => false,
            'class'    => 'form-row-wide',
        ],
        'shipping_country' => [
            'label'    => __( 'Country / Region', 'woocommerce' ),
            'value'    => $shipping_country,
            'required' => true,
            'type'     => 'country',
            'class'    => 'form-row-wide',
        ],
        'shipping_address_1' => [
            'label'       => __( 'Street address', 'woocommerce' ),
            'value'       => $order->get_shipping_address_1(),
            'required'    => true,
            'class'       => 'form-row-wide',
            'placeholder' => __( 'House number and street name', 'woocommerce' ),
        ],
        'shipping_address_2' => [
            'label'       => '',
            'value'       => $order->get_shipping_address_2(),
            'required'    => false,
            'class'       => 'form-row-wide',
            'placeholder' => __( 'Apartment, suite, unit, etc. (optional)', 'woocommerce' ),
        ],
        'shipping_postcode' => [
            'label'    => __( 'Postcode / ZIP', 'woocommerce' ),
            'value'    => $order->get_shipping_postcode(),
            'required' => true,
            'class'    => 'form-row-first',
        ],
        'shipping_city' => [
            'label'    => __( 'Town / City', 'woocommerce' ),
            'value'    => $order->get_shipping_city(),
            'required' => true,
            'class'    => 'form-row-last',
        ],
        'shipping_state' => [
            'label'    => __( 'State / County', 'woocommerce' ),
            'value'    => $order->get_shipping_state(),
            'required' => false,
            'type'     => 'state',
            'class'    => 'form-row-wide',
        ],
    ];

    ?>
    <style>
        .hercules-pay-wrapper {
            display: flex;
            gap: 40px;
            align-items: flex-start;
        }
        .hercules-pay-left {
            flex: 1 1 55%;
            min-width: 0;
        }
        .hercules-pay-right {
            flex: 1 1 40%;
            min-width: 0;
        }
        .hercules-pay-right h3 {
            margin: 0 0 1em;
            padding-bottom: 0.5em;
            border-bottom: 1px solid #e0e0e0;
            font-size: 1.2em;
        }
        @media (max-width: 768px) {
            .hercules-pay-wrapper {
                flex-direction: column;
                gap: 20px;
            }
            .hercules-pay-left,
            .hercules-pay-right {
                flex: 1 1 100%;
            }
        }

        .hercules-address-fields { margin-bottom: 0; }
        .hercules-address-section { margin-bottom: 1.5em; }
        .hercules-address-section h3 {
            margin: 0 0 1em;
            padding-bottom: 0.5em;
            border-bottom: 1px solid #e0e0e0;
            font-size: 1.2em;
        }
        .hercules-address-section .woocommerce-billing-fields__field-wrapper,
        .hercules-address-section .woocommerce-shipping-fields__field-wrapper {
            display: flex;
            flex-wrap: wrap;
            gap: 0;
        }
        .hercules-address-section .form-row {
            margin-bottom: 1em;
            box-sizing: border-box;
        }
        .hercules-address-section .form-row-wide { width: 100%; }
        .hercules-address-section .form-row-first { width: 48%; margin-right: 4%; }
        .hercules-address-section .form-row-last { width: 48%; }
        .hercules-address-section label {
            display: block;
            font-weight: 600;
            margin-bottom: 5px;
            font-size: 14px;
        }
        .hercules-address-section label .required {
            color: #e00;
            text-decoration: none;
        }
        .hercules-address-section input[type="text"],
        .hercules-address-section input[type="email"],
        .hercules-address-section input[type="tel"],
        .hercules-address-section select {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
        }
        .hercules-address-section input:focus,
        .hercules-address-section select:focus {
            border-color: #333;
            outline: none;
        }
        .hercules-shipping-toggle {
            margin: 1.5em 0;
            padding: 1em 0;
            border-top: 1px solid #e0e0e0;
            border-bottom: 1px solid #e0e0e0;
        }
        .hercules-shipping-toggle label {
            display: inline;
            font-weight: 600;
            font-size: 1.1em;
            cursor: pointer;
        }
        .hercules-shipping-toggle input[type="checkbox"] {
            margin-right: 8px;
            width: auto;
            cursor: pointer;
        }
        .hercules-shipping-section { display: none; }
        .hercules-shipping-section.active { display: block; }
        @media (max-width: 600px) {
            .hercules-address-section .form-row-first,
            .hercules-address-section .form-row-last {
                width: 100%;
                margin-right: 0;
            }
        }
    </style>

    <div class="hercules-pay-wrapper">

    <div class="hercules-pay-left">
    <div class="hercules-address-fields" id="hercules-address-fields">

        <div class="hercules-address-section">
            <h3><?php esc_html_e( 'Billing details', 'woocommerce' ); ?></h3>
            <div class="woocommerce-billing-fields__field-wrapper">
                <?php hercules_render_address_fields( $billing_fields, $countries, $states ); ?>
            </div>
        </div>

        <div class="hercules-shipping-toggle">
            <label for="ship_to_different_address">
                <input type="checkbox" id="ship_to_different_address" name="ship_to_different_address" value="1" <?php checked( $has_shipping ); ?> />
                <?php esc_html_e( 'Ship to a different address?', 'woocommerce' ); ?>
            </label>
        </div>

        <div class="hercules-address-section hercules-shipping-section <?php echo $has_shipping ? 'active' : ''; ?>" id="hercules-shipping-fields">
            <h3><?php esc_html_e( 'Shipping address', 'woocommerce' ); ?></h3>
            <div class="woocommerce-shipping-fields__field-wrapper">
                <?php hercules_render_address_fields( $shipping_fields, $countries, $states ); ?>
            </div>
        </div>

    </div>
    </div>

    <div class="hercules-pay-right" id="hercules-pay-right">
        <h3><?php esc_html_e( 'Your order', 'woocommerce' ); ?></h3>
    </div>

    </div>

    <script>
    document.addEventListener('DOMContentLoaded', function() {
        var form     = document.getElementById('order_review');
        var rightCol = document.getElementById('hercules-pay-right');
        var addrBox  = document.getElementById('hercules-address-fields');

        // Move order form into right column
        if (form && rightCol) {
            rightCol.appendChild(form);
        }

        // Move login form into right column (shown for logged-out users)
        var loginForm = document.querySelector('.woocommerce-form.woocommerce-form-login.login');
        if (loginForm && rightCol) {
            rightCol.insertBefore(loginForm, rightCol.firstChild);
        }

        // On form submit, copy address fields as hidden inputs into the form
        if (form && addrBox) {
            form.addEventListener('submit', function() {
                form.querySelectorAll('.hercules-hidden-addr').forEach(function(el) { el.remove(); });
                addrBox.querySelectorAll('input, select').forEach(function(field) {
                    if (!field.name) return;
                    var hidden = document.createElement('input');
                    hidden.type      = 'hidden';
                    hidden.name      = field.name;
                    hidden.value     = field.type === 'checkbox' ? (field.checked ? '1' : '') : field.value;
                    hidden.className = 'hercules-hidden-addr';
                    form.appendChild(hidden);
                });
            });
        }

        // Shipping toggle
        var checkbox = document.getElementById('ship_to_different_address');
        var section  = document.getElementById('hercules-shipping-fields');
        if (checkbox && section) {
            function toggle() {
                if (checkbox.checked) {
                    section.classList.add('active');
                    section.querySelectorAll('[data-required="1"]').forEach(function(el) {
                        el.setAttribute('required', 'required');
                    });
                } else {
                    section.classList.remove('active');
                    section.querySelectorAll('[required]').forEach(function(el) {
                        el.removeAttribute('required');
                    });
                }
            }
            checkbox.addEventListener('change', toggle);
            toggle();
        }

        // Country→State dynamic update
        document.querySelectorAll('.hercules-country-select').forEach(function(countrySelect) {
            countrySelect.addEventListener('change', function() {
                var prefix    = this.name.replace('_country', '');
                var stateWrap = document.getElementById(prefix + '_state_wrapper');
                if (!stateWrap) return;

                var statesJson = this.getAttribute('data-states');
                var allStates  = statesJson ? JSON.parse(statesJson) : {};
                var selected   = allStates[this.value] || {};
                var keys       = Object.keys(selected);

                if (keys.length === 0) {
                    stateWrap.innerHTML =
                        '<label for="' + prefix + '_state">' +
                        '<?php echo esc_js( __( "State / County", "woocommerce" ) ); ?>' +
                        '</label>' +
                        '<input type="text" name="' + prefix + '_state" id="' + prefix + '_state" value="" />';
                } else {
                    var html = '<label for="' + prefix + '_state">' +
                        '<?php echo esc_js( __( "State / County", "woocommerce" ) ); ?>' +
                        ' <abbr class="required" title="required">*</abbr></label>' +
                        '<select name="' + prefix + '_state" id="' + prefix + '_state" required>';
                    html += '<option value=""><?php echo esc_js( __( "Select an option&hellip;", "woocommerce" ) ); ?></option>';
                    keys.forEach(function(code) {
                        html += '<option value="' + code + '">' + selected[code] + '</option>';
                    });
                    html += '</select>';
                    stateWrap.innerHTML = html;
                }
            });
        });
    });
    </script>
    <?php
}

/**
 * Render a set of address fields.
 */
function hercules_render_address_fields( $fields, $countries, $all_states ) {
    foreach ( $fields as $key => $field ) {
        $type        = $field['type'] ?? 'text';
        $required    = $field['required'] ?? false;
        $req_html    = $required ? ' <abbr class="required" title="required">*</abbr>' : '';
        $placeholder = $field['placeholder'] ?? '';
        $row_class   = $field['class'] ?? 'form-row-wide';
        $value       = $field['value'] ?? '';

        echo '<p class="form-row ' . esc_attr( $row_class ) . '">';

        if ( $type === 'country' ) {
            echo '<label for="' . esc_attr( $key ) . '">' . esc_html( $field['label'] ) . $req_html . '</label>';
            echo '<select name="' . esc_attr( $key ) . '" id="' . esc_attr( $key ) . '" class="hercules-country-select"';
            echo ' data-states="' . esc_attr( wp_json_encode( $all_states ) ) . '"';
            if ( $required ) echo ' required';
            echo '>';
            echo '<option value="">' . esc_html__( 'Select a country / region&hellip;', 'woocommerce' ) . '</option>';
            foreach ( $countries as $code => $name ) {
                echo '<option value="' . esc_attr( $code ) . '"' . selected( $value, $code, false ) . '>' . esc_html( $name ) . '</option>';
            }
            echo '</select>';

        } elseif ( $type === 'state' ) {
            $prefix      = str_replace( '_state', '', $key );
            $country_val = '';
            foreach ( $fields as $fk => $fv ) {
                if ( $fk === $prefix . '_country' ) {
                    $country_val = $fv['value'];
                    break;
                }
            }
            $country_states = $all_states[ $country_val ] ?? [];

            echo '<span id="' . esc_attr( $key ) . '_wrapper">';
            if ( ! empty( $country_states ) ) {
                echo '<label for="' . esc_attr( $key ) . '">' . esc_html( $field['label'] ) . $req_html . '</label>';
                echo '<select name="' . esc_attr( $key ) . '" id="' . esc_attr( $key ) . '"';
                if ( $required ) echo ' required';
                echo '>';
                echo '<option value="">' . esc_html__( 'Select an option&hellip;', 'woocommerce' ) . '</option>';
                foreach ( $country_states as $code => $name ) {
                    echo '<option value="' . esc_attr( $code ) . '"' . selected( $value, $code, false ) . '>' . esc_html( $name ) . '</option>';
                }
                echo '</select>';
            } else {
                echo '<label for="' . esc_attr( $key ) . '">' . esc_html( $field['label'] ) . '</label>';
                echo '<input type="text" name="' . esc_attr( $key ) . '" id="' . esc_attr( $key ) . '" value="' . esc_attr( $value ) . '" />';
            }
            echo '</span>';

        } else {
            if ( $field['label'] ) {
                echo '<label for="' . esc_attr( $key ) . '">' . esc_html( $field['label'] ) . $req_html . '</label>';
            }
            echo '<input type="' . esc_attr( $type ) . '" name="' . esc_attr( $key ) . '" id="' . esc_attr( $key ) . '"';
            echo ' value="' . esc_attr( $value ) . '"';
            if ( $placeholder ) echo ' placeholder="' . esc_attr( $placeholder ) . '"';
            if ( $required ) echo ' required data-required="1"';
            echo ' />';
        }

        echo '</p>';
    }
}

/**
 * Save billing + shipping address when the order-pay form is submitted.
 */
add_action( 'woocommerce_before_pay_action', 'hercules_order_pay_save_address' );

function hercules_order_pay_save_address( $order ) {
    $billing_keys = [
        'billing_first_name', 'billing_last_name', 'billing_company',
        'billing_country', 'billing_address_1', 'billing_address_2',
        'billing_postcode', 'billing_city', 'billing_state',
        'billing_phone', 'billing_email',
    ];

    foreach ( $billing_keys as $field ) {
        if ( isset( $_POST[ $field ] ) ) {
            $setter = 'set_' . $field;
            if ( is_callable( [ $order, $setter ] ) ) {
                $order->$setter( wc_clean( wp_unslash( $_POST[ $field ] ) ) );
            }
        }
    }

    if ( ! empty( $_POST['ship_to_different_address'] ) ) {
        $shipping_keys = [
            'shipping_first_name', 'shipping_last_name', 'shipping_company',
            'shipping_country', 'shipping_address_1', 'shipping_address_2',
            'shipping_postcode', 'shipping_city', 'shipping_state',
        ];

        foreach ( $shipping_keys as $field ) {
            if ( isset( $_POST[ $field ] ) ) {
                $setter = 'set_' . $field;
                if ( is_callable( [ $order, $setter ] ) ) {
                    $order->$setter( wc_clean( wp_unslash( $_POST[ $field ] ) ) );
                }
            }
        }
    } else {
        $order->set_shipping_first_name( wc_clean( wp_unslash( $_POST['billing_first_name'] ?? '' ) ) );
        $order->set_shipping_last_name( wc_clean( wp_unslash( $_POST['billing_last_name'] ?? '' ) ) );
        $order->set_shipping_company( wc_clean( wp_unslash( $_POST['billing_company'] ?? '' ) ) );
        $order->set_shipping_country( wc_clean( wp_unslash( $_POST['billing_country'] ?? '' ) ) );
        $order->set_shipping_address_1( wc_clean( wp_unslash( $_POST['billing_address_1'] ?? '' ) ) );
        $order->set_shipping_address_2( wc_clean( wp_unslash( $_POST['billing_address_2'] ?? '' ) ) );
        $order->set_shipping_postcode( wc_clean( wp_unslash( $_POST['billing_postcode'] ?? '' ) ) );
        $order->set_shipping_city( wc_clean( wp_unslash( $_POST['billing_city'] ?? '' ) ) );
        $order->set_shipping_state( wc_clean( wp_unslash( $_POST['billing_state'] ?? '' ) ) );
    }

    $order->save();
}
