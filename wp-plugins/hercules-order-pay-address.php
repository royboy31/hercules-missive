<?php
/**
 * Plugin Name: Hercules Order Pay Address
 * Description: Adds billing & shipping address fields to the WooCommerce order-pay page (like checkout) so customers can update their address before paying.
 * Version: 3.3.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/* ─── Strip variation attributes from product name on order-pay page ─── */
add_filter( 'woocommerce_order_item_name', 'hercules_strip_variation_from_name', 10, 2 );

function hercules_strip_variation_from_name( $name, $item ) {
    if ( ! function_exists( 'is_wc_endpoint_url' ) || ! is_wc_endpoint_url( 'order-pay' ) ) {
        return $name;
    }

    // Strip variation suffix: "Product Name - Attribute Value" → "Product Name"
    $dash_pos = strrpos( $name, ' - ' );
    if ( $dash_pos !== false ) {
        $name = substr( $name, 0, $dash_pos );
    }

    // Temporarily unhook dedup filter so we can read formatted meta
    remove_filter( 'woocommerce_order_item_get_formatted_meta_data', 'hercules_deduplicate_order_item_meta', 10 );
    $formatted = $item->get_formatted_meta_data( '_', true );
    add_filter( 'woocommerce_order_item_get_formatted_meta_data', 'hercules_deduplicate_order_item_meta', 10, 2 );
    $meta_lines = [];
    foreach ( $formatted as $meta ) {
        $key = strtolower( wp_strip_all_tags( $meta->display_key ) );
        if ( $key === 'shipping' || $key === 'setup fee' || $key === 'einrichtungsgebühr' ) continue;
        $display_value = wp_strip_all_tags( $meta->display_value );
        if ( $display_value ) {
            $meta_lines[] = '<strong>' . wp_strip_all_tags( $meta->display_key ) . ':</strong> ' . esc_html( $display_value );
        }
    }

    if ( $meta_lines ) {
        // Deduplicate by value
        $seen = [];
        $unique_lines = [];
        foreach ( $meta_lines as $line ) {
            $val = strtolower( trim( strip_tags( explode( '</strong> ', $line )[1] ?? $line ) ) );
            if ( in_array( $val, $seen, true ) ) continue;
            $seen[] = $val;
            $unique_lines[] = $line;
        }
        $name .= '<br><small style="color:#666; font-weight:normal; line-height:1.6;">'
               . implode( '<br>', $unique_lines )
               . '</small>';
    }

    return $name;
}

/* ─── Hide duplicate order item meta on order-pay page & emails ─── */
add_filter( 'woocommerce_order_item_get_formatted_meta_data', 'hercules_deduplicate_order_item_meta', 10, 2 );

function hercules_deduplicate_order_item_meta( $formatted_meta, $item ) {
    // On order-pay page: suppress default meta display entirely (we show it in the item name instead)
    $is_order_pay = function_exists( 'is_wc_endpoint_url' ) && is_wc_endpoint_url( 'order-pay' );
    if ( $is_order_pay ) {
        return [];
    }

    // In emails: deduplicate by value
    if ( ! doing_action( 'woocommerce_email_order_details' ) ) {
        return $formatted_meta;
    }

    $seen_values = [];
    $filtered    = [];

    foreach ( $formatted_meta as $meta_id => $meta ) {
        $norm_value = strtolower( trim( wp_strip_all_tags( $meta->display_value ) ) );
        if ( in_array( $norm_value, $seen_values, true ) ) {
            continue;
        }
        $seen_values[] = $norm_value;
        $filtered[ $meta_id ] = $meta;
    }

    return $filtered;
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
        'billing_vat_number' => [
            'label'       => __( 'USt-IdNr.', 'woocommerce' ),
            'value'       => $order->get_meta( '_billing_vat_number' ),
            'required'    => false,
            'class'       => 'form-row-wide',
            'placeholder' => __( 'USt-IdNr. eingeben (optional)', 'woocommerce' ),
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

        /* ─── Login form styling ─── */
        .woocommerce-form.woocommerce-form-login.login {
            font-family: 'Jost', sans-serif;
            color: #253461;
            background: #f9fafb;
            border: 1px solid #e0e0e0;
            border-radius: 12px;
            padding: 24px 28px;
            margin-bottom: 24px;
        }
        .woocommerce-form-login h2,
        .woocommerce-form-login .hercules-login-title {
            font-family: 'Jost', sans-serif;
            font-size: 1.2em;
            font-weight: 700;
            color: #253461;
            margin: 0 0 6px;
            padding: 0;
        }
        .woocommerce-form-login .hercules-login-subtitle {
            font-size: 13px;
            color: #666;
            margin: 0 0 18px;
        }
        .woocommerce-form-login .hercules-login-fields {
            display: flex;
            gap: 16px;
            align-items: flex-end;
        }
        .woocommerce-form-login .hercules-login-field {
            flex: 1;
            min-width: 0;
        }
        .woocommerce-form-login label {
            display: block;
            font-family: 'Jost', sans-serif;
            font-weight: 600;
            font-size: 13px;
            color: #253461;
            margin-bottom: 5px;
        }
        .woocommerce-form-login input[type="text"],
        .woocommerce-form-login input[type="password"] {
            width: 100%;
            padding: 10px 14px;
            border: 1px solid #ccc;
            border-radius: 8px;
            font-family: 'Jost', sans-serif;
            font-size: 14px;
            color: #253461;
            box-sizing: border-box;
            transition: border-color 0.2s;
        }
        .woocommerce-form-login input[type="text"]:focus,
        .woocommerce-form-login input[type="password"]:focus {
            border-color: #253461;
            outline: none;
        }
        .woocommerce-form-login .hercules-login-bottom {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 16px;
            gap: 12px;
        }
        .woocommerce-form-login .hercules-login-bottom-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .woocommerce-form-login button[type="submit"],
        .woocommerce-form-login input[type="submit"],
        .woocommerce-form-login .button,
        .woocommerce-form-login .woocommerce-button {
            font-family: 'Jost', sans-serif !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            color: #fff !important;
            background: #253461 !important;
            border: 2px solid #253461 !important;
            border-radius: 50px !important;
            padding: 10px 28px !important;
            cursor: pointer !important;
            transition: background 0.2s, color 0.2s !important;
            white-space: nowrap !important;
            text-transform: none !important;
            line-height: 1.4 !important;
            box-shadow: none !important;
            display: inline-block !important;
        }
        .woocommerce-form-login button[type="submit"]:hover,
        .woocommerce-form-login input[type="submit"]:hover,
        .woocommerce-form-login .button:hover,
        .woocommerce-form-login .woocommerce-button:hover {
            background: transparent !important;
            color: #253461 !important;
        }
        .woocommerce-form-login .woocommerce-form-login__rememberme {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            color: #666;
            white-space: nowrap;
        }
        .woocommerce-form-login .woocommerce-form-login__rememberme input[type="checkbox"] {
            width: auto;
            margin: 0;
        }
        .woocommerce-form-login .lost_password,
        .woocommerce-form-login .woocommerce-LostPassword {
            margin: 0;
        }
        .woocommerce-form-login .lost_password a,
        .woocommerce-form-login .woocommerce-LostPassword a {
            font-size: 13px;
            color: #253461;
            text-decoration: underline;
            font-weight: 500;
        }
        .woocommerce-form-login .lost_password a:hover,
        .woocommerce-form-login .woocommerce-LostPassword a:hover {
            color: #10C99E;
        }
        /* VAT validation message */
        #vat_validation_msg {
            display: none;
            font-size: 12px;
            margin-top: 4px;
            font-family: 'Jost', sans-serif;
        }
        /* Order summary: partial payment highlight row */
        .hercules-pay-row td,
        .hercules-pay-row th {
            background: #253461 !important;
            color: #fff !important;
            font-weight: 700 !important;
            font-size: 1.05em !important;
            padding: 12px 10px !important;
        }
        .hercules-pay-row th {
            border-radius: 6px 0 0 6px !important;
        }
        .hercules-pay-row td {
            border-radius: 0 6px 6px 0 !important;
        }
        /* Separator row */
        .hercules-separator td {
            border-top: 2px solid #e0e0e0 !important;
            padding-top: 10px !important;
        }
        .hercules-separator th {
            border-top: 2px solid #e0e0e0 !important;
            padding-top: 10px !important;
        }
        /* Dim tax row when VAT exempt */
        .hercules-tax-exempt td,
        .hercules-tax-exempt th {
            text-decoration: line-through !important;
            opacity: 0.45 !important;
        }
        /* Hide original WC info notice on order-pay when login form present */
        .woocommerce-form-login + .woocommerce-info,
        .woocommerce-info:has(+ .woocommerce-form-login) {
            display: none;
        }
        @media (max-width: 600px) {
            .woocommerce-form-login .hercules-login-fields {
                flex-direction: column;
                gap: 12px;
            }
            .woocommerce-form-login .hercules-login-bottom {
                flex-direction: column;
                align-items: stretch;
            }
            .woocommerce-form-login .hercules-login-bottom-left {
                justify-content: space-between;
            }
        }
    </style>

    <?php
    $pp_pct = (float) $order->get_meta( '_partial_payment_percent' );
    $has_partial = ( $pp_pct > 0 && $pp_pct < 100 );
    // Get the real total (bypass partial payment filter)
    if ( function_exists( 'hercules_pp_filter_total' ) ) {
        remove_filter( 'woocommerce_order_get_total', 'hercules_pp_filter_total', 10 );
    }
    $real_total = (float) $order->get_total();
    if ( function_exists( 'hercules_pp_filter_total' ) ) {
        add_filter( 'woocommerce_order_get_total', 'hercules_pp_filter_total', 10, 2 );
    }
    ?>
    <div class="hercules-pay-wrapper"
         data-order-id="<?php echo esc_attr( $order_id ); ?>"
         data-ajax-url="<?php echo esc_attr( admin_url( 'admin-ajax.php' ) ); ?>"
         data-subtotal="<?php echo esc_attr( $order->get_subtotal() ); ?>"
         data-tax="<?php echo esc_attr( $order->get_total_tax() ); ?>"
         data-shipping="<?php echo esc_attr( $order->get_shipping_total() ); ?>"
         data-total="<?php echo esc_attr( $real_total ); ?>"
         data-currency="<?php echo esc_attr( $order->get_currency() ); ?>"
         data-partial-pct="<?php echo esc_attr( $has_partial ? $pp_pct : '' ); ?>"
         data-partial-amount="<?php echo esc_attr( $has_partial ? number_format( $real_total * $pp_pct / 100, 2, '.', '' ) : '' ); ?>"
         data-vat="<?php echo esc_attr( $order->get_meta( '_billing_vat_number' ) ); ?>"
    >

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

        // ─── Restructure tfoot for clear totals breakdown ───
        var shopTable = form ? form.querySelector('.shop_table') : null;
        var wrapperEl = document.querySelector('.hercules-pay-wrapper');
        if (shopTable && wrapperEl) {
            var tfoot = shopTable.querySelector('tfoot');
            if (tfoot) {
                var subtotal   = wrapperEl.getAttribute('data-subtotal');
                var tax        = wrapperEl.getAttribute('data-tax');
                var total      = wrapperEl.getAttribute('data-total');
                var partialPct = wrapperEl.getAttribute('data-partial-pct');
                var partialAmt = wrapperEl.getAttribute('data-partial-amount');
                var cur        = wrapperEl.getAttribute('data-currency') || 'EUR';
                var sym        = cur === 'GBP' ? '£' : '€';

                function fmtPrice(val) {
                    var n = parseFloat(val);
                    return sym + '&nbsp;' + n.toFixed(2).replace('.', ',');
                }

                // Keep the partial payment banner at the top

                // Check if order already has VAT exemption
                var existingVat = wrapperEl.getAttribute('data-vat') || '';
                var alreadyExempt = existingVat && parseFloat(tax) === 0;

                // Build new tfoot rows
                var html = '';
                html += '<tr><th scope="row" colspan="2">Zwischensumme:</th><td class="product-total">' + fmtPrice(subtotal) + '</td></tr>';
                html += '<tr class="hercules-tax-row' + (alreadyExempt ? ' hercules-tax-exempt' : '') + '"><th scope="row" colspan="2">MwSt.' + (alreadyExempt ? ' (befreit)' : '') + ':</th><td class="product-total">' + fmtPrice(tax) + '</td></tr>';
                html += '<tr class="hercules-total-row"><th scope="row" colspan="2">Gesamt:</th><td class="product-total"><strong>' + fmtPrice(total) + '</strong></td></tr>';

                if (partialPct) {
                    html += '<tr class="hercules-separator"><th colspan="3"></th></tr>';
                    html += '<tr class="hercules-pay-row"><th scope="row" colspan="2">Zahlbetrag (' + partialPct + '% Anzahlung):</th><td class="product-total">' + fmtPrice(partialAmt) + '</td></tr>';
                }

                // Keep payment method row if present
                var payMethodRow = '';
                tfoot.querySelectorAll('tr').forEach(function(row) {
                    var th = row.querySelector('th');
                    if (th && th.textContent.toLowerCase().indexOf('zahlungsmethode') !== -1) {
                        payMethodRow = row.outerHTML;
                    }
                });
                if (payMethodRow) html += payMethodRow;

                tfoot.innerHTML = html;
            }
        }

        // Move login form into right column and restyle (shown for logged-out users)
        var loginForm = document.querySelector('.woocommerce-form.woocommerce-form-login.login');
        if (loginForm && rightCol) {
            rightCol.insertBefore(loginForm, rightCol.firstChild);

            // Restructure login form for better layout
            var usernameLabel = loginForm.querySelector('label[for="username"]');
            var usernameInput = loginForm.querySelector('#username');
            var passwordLabel = loginForm.querySelector('label[for="password"]');
            var passwordInput = loginForm.querySelector('#password');
            var rememberMe    = loginForm.querySelector('.woocommerce-form-login__rememberme');
            var submitBtn     = loginForm.querySelector('button[type="submit"], input[type="submit"], .button');
            var lostPw        = loginForm.querySelector('.lost_password, .woocommerce-LostPassword');

            // Remove any existing h2 or the WC info paragraph
            var existingH2 = loginForm.querySelector('h2');
            if (existingH2) existingH2.remove();

            // Build title
            var title = document.createElement('div');
            title.className = 'hercules-login-title';
            title.textContent = 'Anmelden, um fortzufahren';

            var subtitle = document.createElement('div');
            subtitle.className = 'hercules-login-subtitle';
            subtitle.textContent = 'Bitte melden Sie sich an, um mit der Zahlung fortzufahren.';

            // Build side-by-side fields row
            var fieldsRow = document.createElement('div');
            fieldsRow.className = 'hercules-login-fields';

            var userWrap = document.createElement('div');
            userWrap.className = 'hercules-login-field';
            if (usernameLabel) userWrap.appendChild(usernameLabel);
            if (usernameInput) userWrap.appendChild(usernameInput);

            var passWrap = document.createElement('div');
            passWrap.className = 'hercules-login-field';
            if (passwordLabel) passwordLabel.textContent = 'Passwort';
            if (passwordLabel) passWrap.appendChild(passwordLabel);
            if (passwordInput) passWrap.appendChild(passwordInput);

            fieldsRow.appendChild(userWrap);
            fieldsRow.appendChild(passWrap);

            // Build bottom row: remember me + login btn | lost password
            var bottomRow = document.createElement('div');
            bottomRow.className = 'hercules-login-bottom';
            var bottomLeft = document.createElement('div');
            bottomLeft.className = 'hercules-login-bottom-left';
            if (rememberMe) bottomLeft.appendChild(rememberMe);
            if (submitBtn) bottomLeft.appendChild(submitBtn);
            bottomRow.appendChild(bottomLeft);
            if (lostPw) bottomRow.appendChild(lostPw);

            // Clear form and rebuild
            loginForm.innerHTML = '';
            loginForm.appendChild(title);
            loginForm.appendChild(subtitle);
            loginForm.appendChild(fieldsRow);
            loginForm.appendChild(bottomRow);
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

        // ─── Live VAT verification + real-time total updates ───
        var vatInput = document.getElementById('billing_vat_number');
        if (vatInput) {
            // Add validation message element after the VAT input
            var vatMsg = document.createElement('span');
            vatMsg.id = 'vat_validation_msg';
            vatInput.parentNode.appendChild(vatMsg);

            var wrapper  = document.querySelector('.hercules-pay-wrapper');
            var orderId  = wrapper ? wrapper.getAttribute('data-order-id') : '';
            var ajaxUrl  = wrapper ? wrapper.getAttribute('data-ajax-url') : '';
            var debounce = null;
            var existingVatVal = wrapper ? wrapper.getAttribute('data-vat') : '';
            var lastChecked = existingVatVal || '';
            var isExempt = !!(existingVatVal && parseFloat(wrapper.getAttribute('data-tax')) === 0);

            // Store original values from data attributes
            // Note: if order is already VAT-exempt, originals are the exempt values
            var origTax      = wrapperEl ? wrapperEl.getAttribute('data-tax') : '0';
            var origTotal    = wrapperEl ? wrapperEl.getAttribute('data-total') : '0';
            var origPartial  = wrapperEl ? wrapperEl.getAttribute('data-partial-amount') : '';

            // If already exempt, show validation message on load
            if (isExempt && existingVatVal) {
                showVatMsg('Gültige USt-IdNr. ✓ (MwSt. befreit)', '#10C99E');
            }

            var vatPatterns = {
                AT: /^ATU\d{8}$/,  BE: /^BE0\d{9}$/,  BG: /^BG\d{9,10}$/,
                CY: /^CY\d{8}[A-Z]$/, CZ: /^CZ\d{8,10}$/, DE: /^DE\d{9}$/,
                DK: /^DK\d{8}$/,  EE: /^EE\d{9}$/,  EL: /^EL\d{9}$/,
                ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/, FI: /^FI\d{8}$/, FR: /^FR[A-Z0-9]{2}\d{9}$/,
                GB: /^GB(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
                HR: /^HR\d{11}$/, HU: /^HU\d{8}$/, IE: /^IE\d[A-Z0-9+*]\d{5}[A-Z]$/,
                IT: /^IT\d{11}$/, LT: /^LT(\d{9}|\d{12})$/, LU: /^LU\d{8}$/,
                LV: /^LV\d{11}$/, MT: /^MT\d{8}$/, NL: /^NL\d{9}B\d{2}$/,
                PL: /^PL\d{10}$/, PT: /^PT\d{9}$/, RO: /^RO\d{2,10}$/,
                SE: /^SE\d{12}$/, SI: /^SI\d{8}$/, SK: /^SK\d{10}$/
            };

            function showVatMsg(text, color) {
                vatMsg.innerHTML = text;
                vatMsg.style.color = color;
                vatMsg.style.display = 'block';
            }

            function fmtPriceJS(val) {
                var n = parseFloat(val);
                var cur = wrapperEl ? wrapperEl.getAttribute('data-currency') : 'EUR';
                var sym = cur === 'GBP' ? '£' : '€';
                return sym + '&nbsp;' + n.toFixed(2).replace('.', ',');
            }

            function updateOrderTotals(data) {
                // Update tax row
                var taxRow = document.querySelector('.hercules-tax-row');
                if (taxRow) {
                    var taxTd = taxRow.querySelector('td');
                    if (taxTd) taxTd.innerHTML = data.exempt ? fmtPriceJS(0) : fmtPriceJS(data.tax_total);
                    if (data.exempt) {
                        taxRow.classList.add('hercules-tax-exempt');
                    } else {
                        taxRow.classList.remove('hercules-tax-exempt');
                    }
                }

                // Update total row
                var totalRow = document.querySelector('.hercules-total-row');
                if (totalRow) {
                    var totalTd = totalRow.querySelector('td');
                    if (totalTd) totalTd.innerHTML = '<strong>' + fmtPriceJS(data.order_total) + '</strong>';
                }

                // Update partial payment row
                var payRow = document.querySelector('.hercules-pay-row');
                if (payRow && data.partial) {
                    var payTd = payRow.querySelector('td');
                    if (payTd) payTd.innerHTML = fmtPriceJS(data.partial_amount);
                }
            }

            function restoreOrigTotals() {
                var taxRow = document.querySelector('.hercules-tax-row');
                if (taxRow) {
                    var taxTd = taxRow.querySelector('td');
                    if (taxTd) taxTd.innerHTML = fmtPriceJS(origTax);
                    taxRow.classList.remove('hercules-tax-exempt');
                }
                var totalRow = document.querySelector('.hercules-total-row');
                if (totalRow) {
                    var totalTd = totalRow.querySelector('td');
                    if (totalTd) totalTd.innerHTML = '<strong>' + fmtPriceJS(origTotal) + '</strong>';
                }
                var payRow = document.querySelector('.hercules-pay-row');
                if (payRow && origPartial) {
                    var payTd = payRow.querySelector('td');
                    if (payTd) payTd.innerHTML = fmtPriceJS(origPartial);
                }
            }

            function checkVat() {
                var val = vatInput.value.replace(/[\s.\-]/g, '').toUpperCase();

                // Empty → restore totals
                if (!val) {
                    vatMsg.style.display = 'none';
                    if (isExempt) {
                        isExempt = false;
                        lastChecked = '';
                        // If orig tax was already 0 (order created exempt), we need AJAX to recalculate with tax
                        if (parseFloat(origTax) === 0) {
                            var fd = new FormData();
                            fd.append('action', 'hercules_order_pay_vat_check');
                            fd.append('order_id', orderId);
                            fd.append('vat_number', '');
                            fetch(ajaxUrl, { method: 'POST', credentials: 'same-origin', body: fd })
                                .then(function(r) { return r.json(); })
                                .then(function(res) {
                                    if (res.success) updateOrderTotals(res.data);
                                });
                        } else {
                            restoreOrigTotals();
                        }
                    }
                    return;
                }

                // Format check
                var prefix = val.substring(0, 2);
                var pattern = vatPatterns[prefix];
                if (!pattern || !pattern.test(val)) {
                    showVatMsg('Bitte geben Sie eine gültige EU-USt-IdNr. ein (z.B. DE123456789)', '#e2401c');
                    return;
                }

                if (val === lastChecked) return;

                // Valid format → call AJAX for VIES verification + recalculation
                showVatMsg('Gültiges Format ✓ — Wird geprüft…', '#999');

                var fd = new FormData();
                fd.append('action', 'hercules_order_pay_vat_check');
                fd.append('order_id', orderId);
                fd.append('vat_number', val);

                fetch(ajaxUrl, { method: 'POST', credentials: 'same-origin', body: fd })
                    .then(function(r) { return r.json(); })
                    .then(function(res) {
                        if (res.success) {
                            lastChecked = val;
                            isExempt = !!res.data.exempt;
                            var msg = 'Gültige USt-IdNr. ✓';
                            if (res.data.name) msg += ' — ' + res.data.name;
                            if (res.data.exempt) msg += ' (MwSt. befreit)';
                            showVatMsg(msg, '#10C99E');
                            updateOrderTotals(res.data);
                        } else {
                            showVatMsg(res.data && res.data.message ? res.data.message : 'Ungültige USt-IdNr.', '#e2401c');
                        }
                    })
                    .catch(function() {
                        showVatMsg('Überprüfung fehlgeschlagen. Bitte versuchen Sie es erneut.', '#e2401c');
                    });
            }

            vatInput.addEventListener('input', function() {
                clearTimeout(debounce);
                debounce = setTimeout(checkVat, 800);
            });
            vatInput.addEventListener('blur', function() {
                clearTimeout(debounce);
                checkVat();
            });
        }
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

    // Save VAT number and recalculate if exempt
    $vat_number = isset( $_POST['billing_vat_number'] ) ? wc_clean( wp_unslash( $_POST['billing_vat_number'] ) ) : '';
    $old_vat    = $order->get_meta( '_billing_vat_number' );
    $order->update_meta_data( '_billing_vat_number', $vat_number );
    $order->update_meta_data( '_vat_number', $vat_number );

    // DE rule: any valid VAT number → exempt (zero taxes)
    if ( ! empty( $vat_number ) ) {
        hercules_order_pay_zero_taxes( $order );
    } elseif ( ! empty( $old_vat ) && empty( $vat_number ) ) {
        // VAT removed — recalculate with taxes
        $order->calculate_taxes();
        $order->calculate_totals( true );
    }

    // Update the original total for partial payment plugin
    $pct = (float) $order->get_meta( '_partial_payment_percent' );
    if ( $pct > 0 && $pct < 100 ) {
        // Remove our filter temporarily to get the real total
        remove_filter( 'woocommerce_order_get_total', 'hercules_pp_filter_total', 10 );
        $new_total = $order->get_total();
        add_filter( 'woocommerce_order_get_total', 'hercules_pp_filter_total', 10, 2 );
        $order->update_meta_data( '_original_order_total', $new_total );
    }

    $order->save();
}

/**
 * Zero out all taxes on an order (VAT exempt).
 */
function hercules_order_pay_zero_taxes( $order ) {
    foreach ( $order->get_items( 'tax' ) as $tax_item ) {
        $tax_item->set_tax_total( 0 );
        $tax_item->set_shipping_tax_total( 0 );
        $tax_item->save();
    }
    foreach ( $order->get_items() as $item ) {
        $item->set_taxes( [ 'total' => [], 'subtotal' => [] ] );
        $item->save();
    }
    foreach ( $order->get_items( 'shipping' ) as $ship ) {
        $ship->set_taxes( [ 'total' => [] ] );
        $ship->save();
    }
    $order->set_cart_tax( 0 );
    $order->set_shipping_tax( 0 );
    $order->calculate_totals( false );
}

/* ───────────────────────────────────────────────
 * REST API: Zero taxes when order is created with a VAT number
 * DE rule: any VAT number → 0% tax
 * ─────────────────────────────────────────────── */
add_action( 'woocommerce_rest_insert_shop_order_object', 'hercules_rest_order_vat_exempt', 20, 2 );

function hercules_rest_order_vat_exempt( $order, $request ) {
    $vat = $order->get_meta( '_billing_vat_number' );
    if ( empty( $vat ) ) {
        return;
    }

    // Only act if the order actually has tax (avoid re-processing)
    if ( (float) $order->get_total_tax() <= 0 ) {
        return;
    }

    hercules_order_pay_zero_taxes( $order );
    $order->save();
}

/* ───────────────────────────────────────────────
 * AJAX: Verify VAT via VIES + return recalculated order totals
 * ─────────────────────────────────────────────── */
add_action( 'wp_ajax_hercules_order_pay_vat_check', 'hercules_order_pay_vat_check' );
add_action( 'wp_ajax_nopriv_hercules_order_pay_vat_check', 'hercules_order_pay_vat_check' );

function hercules_order_pay_vat_check() {
    $raw      = isset( $_POST['vat_number'] ) ? sanitize_text_field( wp_unslash( $_POST['vat_number'] ) ) : '';
    $order_id = isset( $_POST['order_id'] ) ? absint( $_POST['order_id'] ) : 0;
    $vat      = strtoupper( preg_replace( '/[\s.\-]/', '', $raw ) );

    $order = wc_get_order( $order_id );
    if ( ! $order ) {
        wp_send_json_error( [ 'message' => 'Order not found.' ] );
    }

    $currency = $order->get_currency();
    $pct      = (float) $order->get_meta( '_partial_payment_percent' );

    // ── Read-only: calculate the tax-inclusive totals from current order state ──
    // We need the subtotal (without tax) to compute the exempt scenario
    $subtotal_ex_tax = 0;
    foreach ( $order->get_items() as $item ) {
        $subtotal_ex_tax += (float) $item->get_total(); // line total excl. tax
    }
    // Add shipping
    $subtotal_ex_tax += (float) $order->get_shipping_total();

    $current_tax   = (float) $order->get_total_tax();

    // Remove partial-payment filter to get the real stored total
    if ( function_exists( 'hercules_pp_filter_total' ) ) {
        remove_filter( 'woocommerce_order_get_total', 'hercules_pp_filter_total', 10 );
    }
    $current_total = (float) $order->get_total();
    if ( function_exists( 'hercules_pp_filter_total' ) ) {
        add_filter( 'woocommerce_order_get_total', 'hercules_pp_filter_total', 10, 2 );
    }

    // If VAT field is empty → return totals with tax (recalculate if order was exempt)
    if ( empty( $vat ) ) {
        $tax_total  = $current_tax;
        $full_total = $current_total;

        // If order currently has 0 tax but has line items, recalculate what tax would be
        if ( $current_tax <= 0 && $subtotal_ex_tax > 0 ) {
            $billing_country = $order->get_billing_country() ?: WC()->countries->get_base_country();
            $rates = WC_Tax::find_rates( [ 'country' => $billing_country, 'tax_class' => '' ] );
            $rate  = ! empty( $rates ) ? (float) array_values( $rates )[0]['rate'] : 0;
            $tax_total  = round( $subtotal_ex_tax * $rate / 100, 2 );
            $full_total = $subtotal_ex_tax + $tax_total;
        }

        $partial_amount = ( $pct > 0 && $pct < 100 ) ? $full_total * $pct / 100 : null;

        wp_send_json_success( [
            'vat_valid'      => false,
            'exempt'         => false,
            'tax_total'      => $tax_total,
            'tax_display'    => wc_price( $tax_total, [ 'currency' => $currency ] ),
            'order_total'    => $full_total,
            'total_display'  => wc_price( $full_total, [ 'currency' => $currency ] ),
            'partial'        => $partial_amount !== null,
            'partial_pct'    => $pct,
            'partial_amount' => $partial_amount,
            'partial_display'=> $partial_amount !== null ? wc_price( $partial_amount, [ 'currency' => $currency ] ) : null,
            'full_display'   => wc_price( $full_total, [ 'currency' => $currency ] ),
        ] );
    }

    // Format validation
    $country = substr( $vat, 0, 2 );
    $number  = substr( $vat, 2 );

    if ( strlen( $vat ) < 4 ) {
        wp_send_json_error( [ 'message' => 'USt-IdNr. ist zu kurz.' ] );
    }

    $vat_patterns = [
        'AT' => '/^ATU\d{8}$/',  'BE' => '/^BE0\d{9}$/',  'BG' => '/^BG\d{9,10}$/',
        'CY' => '/^CY\d{8}[A-Z]$/', 'CZ' => '/^CZ\d{8,10}$/', 'DE' => '/^DE\d{9}$/',
        'DK' => '/^DK\d{8}$/',  'EE' => '/^EE\d{9}$/',  'EL' => '/^EL\d{9}$/',
        'ES' => '/^ES[A-Z0-9]\d{7}[A-Z0-9]$/', 'FI' => '/^FI\d{8}$/', 'FR' => '/^FR[A-Z0-9]{2}\d{9}$/',
        'GB' => '/^GB(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/',
        'HR' => '/^HR\d{11}$/', 'HU' => '/^HU\d{8}$/', 'IE' => '/^IE\d[A-Z0-9+*]\d{5}[A-Z]$/',
        'IT' => '/^IT\d{11}$/', 'LT' => '/^LT(\d{9}|\d{12})$/', 'LU' => '/^LU\d{8}$/',
        'LV' => '/^LV\d{11}$/', 'MT' => '/^MT\d{8}$/', 'NL' => '/^NL\d{9}B\d{2}$/',
        'PL' => '/^PL\d{10}$/', 'PT' => '/^PT\d{9}$/', 'RO' => '/^RO\d{2,10}$/',
        'SE' => '/^SE\d{12}$/', 'SI' => '/^SI\d{8}$/', 'SK' => '/^SK\d{10}$/',
    ];

    $pattern = $vat_patterns[ $country ] ?? null;
    if ( ! $pattern || ! preg_match( $pattern, $vat ) ) {
        wp_send_json_error( [ 'message' => 'Bitte geben Sie eine gültige EU-USt-IdNr. ein (z.B. DE123456789)' ] );
    }

    // GB — format check only (post-Brexit, no VIES)
    $vies_valid = false;
    $vies_name  = '';
    if ( $country === 'GB' ) {
        $vies_valid = true;
    } else {
        // VIES check
        $vies_country = ( $country === 'EL' ) ? 'GR' : $country;
        $ch = curl_init( 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number' );
        curl_setopt_array( $ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => wp_json_encode( [ 'countryCode' => $vies_country, 'vatNumber' => $number ] ),
            CURLOPT_HTTPHEADER     => [ 'Content-Type: application/json', 'Accept: application/json' ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_SSL_VERIFYPEER => true,
        ] );
        $result    = curl_exec( $ch );
        $http_code = curl_getinfo( $ch, CURLINFO_HTTP_CODE );
        curl_close( $ch );

        if ( $result === false || $http_code < 200 || $http_code >= 300 ) {
            wp_send_json_error( [ 'message' => 'VIES-Dienst nicht erreichbar. Bitte versuchen Sie es später erneut.' ] );
        }

        $body = json_decode( $result, true );
        if ( ! is_array( $body ) ) {
            wp_send_json_error( [ 'message' => 'Ungültige Antwort vom VIES-Dienst.' ] );
        }

        if ( ! empty( $body['valid'] ) ) {
            $vies_valid = true;
            $vies_name  = ( ! empty( $body['name'] ) && $body['name'] !== '---' ) ? $body['name'] : '';
        } else {
            wp_send_json_error( [ 'message' => 'Diese USt-IdNr. ist laut VIES nicht gültig.' ] );
        }
    }

    // ── Read-only: calculate what totals WOULD be without tax ──
    // Exempt total = subtotal (excl. tax), no tax
    $exempt_total   = $subtotal_ex_tax;
    $partial_amount = ( $pct > 0 && $pct < 100 ) ? $exempt_total * $pct / 100 : null;

    wp_send_json_success( [
        'vat_valid'      => true,
        'name'           => $vies_name,
        'exempt'         => true,
        'tax_total'      => 0,
        'tax_display'    => wc_price( 0, [ 'currency' => $currency ] ),
        'order_total'    => $exempt_total,
        'total_display'  => wc_price( $exempt_total, [ 'currency' => $currency ] ),
        'partial'        => $partial_amount !== null,
        'partial_pct'    => $pct,
        'partial_amount' => $partial_amount,
        'partial_display'=> $partial_amount !== null ? wc_price( $partial_amount, [ 'currency' => $currency ] ) : null,
        'full_display'   => wc_price( $exempt_total, [ 'currency' => $currency ] ),
    ] );
}
